/* FILE: packages/backend/src/custom-gesture-manager.ts */
import fs from 'fs/promises';
import path from 'path';

import { normalizeNameForMtx, type CustomGestureMetadata } from '#shared/index.js';

export const CUSTOM_GESTURES_DIR = '/app/extensions/custom_gestures';

function parseMetadataFromCode(
  codeString: string
): { name?: string; description?: string; type?: 'hand' | 'pose' } | null {
  if (!codeString) return null;
  const match = codeString.match(
    /export\s+const\s+metadata\s*=\s*({[\s\S]*?});?/m
  );
  if (!match?.[1]) return null;
  try {
    const metadata = new Function(`return ${match[1]};`)();
    if (typeof metadata?.name !== 'string' || !metadata.name.trim()) return null;
    return {
      name: metadata.name.trim(),
      description:
        typeof metadata.description === 'string'
          ? metadata.description.trim()
          : undefined,
      type: metadata.type === 'pose' ? 'pose' : 'hand',
    };
  } catch {
    return null;
  }
}

function conflictsWithBuiltIn(name: string): boolean {
  const builtInGestures = [
    'OPEN_PALM',
    'CLOSED_FIST',
    'POINTING_UP',
    'THUMB_UP',
    'THUMB_DOWN',
    'VICTORY',
    'ILOVEYOU',
    'NONE',
  ];
  return builtInGestures.includes(normalizeNameForMtx(name).toUpperCase());
}

export async function scanCustomGesturesDir(): Promise<CustomGestureMetadata[]> {
  const definitions: CustomGestureMetadata[] = [];
  try {
    await fs.mkdir(CUSTOM_GESTURES_DIR, { recursive: true });
    const files = (await fs.readdir(CUSTOM_GESTURES_DIR)).filter((f) =>
      f.endsWith('.js')
    );
    for (const file of files) {
      const filePath = path.join(CUSTOM_GESTURES_DIR, file);
      try {
        const codeString = await fs.readFile(filePath, 'utf-8');
        const metadata = parseMetadataFromCode(codeString);
        if (
          metadata?.name &&
          !conflictsWithBuiltIn(metadata.name) &&
          !definitions.some(
            (d) =>
              normalizeNameForMtx(d.name).toUpperCase() ===
              normalizeNameForMtx(metadata.name!).toUpperCase()
          )
        ) {
          definitions.push({
            id: path.basename(file, '.js'),
            name: metadata.name,
            description: metadata.description,
            filePath,
            codeString,
            type: metadata.type,
          } as CustomGestureMetadata);
        } else if (metadata?.name) {
          console.warn(
            `[CGM] Skipping '${file}': Name "${metadata.name}" conflicts with a built-in or existing custom gesture.`
          );
        } else {
          console.warn(`[CGM] Could not parse valid metadata from: ${file}`);
        }
      } catch (readError) {
        console.error(`[CGM] Error processing file ${filePath}:`, readError);
      }
    }
  } catch (scanError) {
    console.error(
      `[CGM] Error scanning directory ${CUSTOM_GESTURES_DIR}:`,
      scanError
    );
  }
  return definitions;
}

export async function saveCustomGestureFile(
  name: string,
  description: string | undefined,
  type: 'hand' | 'pose',
  codeString: string,
  existingDefinitions: CustomGestureMetadata[]
): Promise<{
  success: boolean;
  message?: string;
  newDefinition?: CustomGestureMetadata;
}> {
  if (!name?.trim() || !codeString)
    return { success: false, message: 'Gesture name and code cannot be empty.' };
  if (conflictsWithBuiltIn(name))
    return {
      success: false,
      message: `Name "${name}" conflicts with a built-in gesture.`,
    };
  const normalizedName = normalizeNameForMtx(name.trim());
  if (
    existingDefinitions.some(
      (d) => normalizeNameForMtx(d.name).toUpperCase() === normalizedName.toUpperCase()
    )
  ) {
    return {
      success: false,
      message: `A custom gesture with the name "${name}" already exists.`,
    };
  }
  const expectedFn = type === 'pose' ? 'checkPose' : 'checkGesture';
  if (!codeString.includes(`export function ${expectedFn}`))
    return {
      success: false,
      message: `Code validation failed: Missing 'export function ${expectedFn}(...)'.`,
    };

  const metadataToEmbed = JSON.stringify(
    { name: name.trim(), description: description?.trim() || '', type },
    null,
    2
  );
  const metadataRegex = /export\s+const\s+metadata\s*=\s*({[\s\S]*?});?/m;
  const finalCodeString = metadataRegex.test(codeString)
    ? codeString.replace(metadataRegex, `export const metadata = ${metadataToEmbed};`)
    : `export const metadata = ${metadataToEmbed};\n\n${codeString}`;

  const filePath = path.join(CUSTOM_GESTURES_DIR, `${normalizedName}.js`);
  try {
    await fs.mkdir(CUSTOM_GESTURES_DIR, { recursive: true });
    await fs.writeFile(filePath, finalCodeString, 'utf-8');
    return {
      success: true,
      newDefinition: {
        id: normalizedName,
        name: name.trim(),
        description: description?.trim(),
        filePath,
        codeString: finalCodeString,
        type,
      },
    };
  } catch (saveError: unknown) {
    const message =
      saveError instanceof Error ? saveError.message : String(saveError);
    return { success: false, message: `Failed to save gesture file: ${message}` };
  }
}

export async function updateCustomGestureFile(
  id: string,
  newName: string,
  newDescription: string
): Promise<{
  success: boolean;
  message?: string;
  updatedDefinition?: CustomGestureMetadata;
}> {
  if (!id || !newName?.trim())
    return { success: false, message: 'Gesture ID and new name cannot be empty.' };
  if (conflictsWithBuiltIn(newName))
    return {
      success: false,
      message: `Name "${newName}" conflicts with a built-in gesture.`,
    };

  const filePath = path.join(CUSTOM_GESTURES_DIR, `${id}.js`);
  try {
    const codeString = await fs.readFile(filePath, 'utf-8');
    const metadata = parseMetadataFromCode(codeString);
    if (!metadata || !metadata.type)
      return {
        success: false,
        message: `Could not parse existing metadata from ${id}.js.`,
      };

    const metadataToEmbed = JSON.stringify(
      { name: newName.trim(), description: newDescription.trim(), type: metadata.type },
      null,
      2
    );
    const metadataRegex = /export\s+const\s+metadata\s*=\s*({[\s\S]*?});?/m;
    const finalCodeString = codeString.replace(
      metadataRegex,
      `export const metadata = ${metadataToEmbed};`
    );

    await fs.writeFile(filePath, finalCodeString, 'utf-8');

    const updatedDefinition: CustomGestureMetadata = {
      id,
      name: newName.trim(),
      description: newDescription.trim(),
      filePath,
      codeString: finalCodeString,
      type: metadata.type,
    };
    return {
      success: true,
      message: 'Gesture updated successfully.',
      updatedDefinition,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to update gesture file: ${message}` };
  }
}

export async function deleteCustomGestureFile(id: string): Promise<{
  success: boolean;
  message?: string;
  deletedId?: string;
}> {
  if (!id) return { success: false, message: 'Invalid ID for deletion.' };
  const filePath = path.join(CUSTOM_GESTURES_DIR, `${id}.js`);
  try {
    await fs.unlink(filePath);
    return { success: true, deletedId: id };
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return { success: true, deletedId: id };
    return {
      success: false,
      message: `Failed to delete gesture file: ${(e as Error).message}`,
    };
  }
}