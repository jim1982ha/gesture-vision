# Dockerfile for Home Assistant Add-on Build
# This Dockerfile expects to be run from the 'build' directory, which is prepared by 'build-assets.sh'.

# The 'ARG' directives must be at the top level.
ARG BUILD_FROM
FROM ${BUILD_FROM}

# Copy the pre-staged application and build it.
COPY . /
RUN /build-assets.sh

# The 'build.json' file tells the supervisor which Dockerfile to use
# for the build. We've simplified this by having build-assets.sh generate
# the final Dockerfile within the context. This file is now primarily for metadata.