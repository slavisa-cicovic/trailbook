#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-central-1}"
AWS_PROFILE="${AWS_PROFILE:-trailbook-deploy}"
ECR_REPOSITORY_URI="${ECR_REPOSITORY_URI:-795644302504.dkr.ecr.eu-central-1.amazonaws.com/trailbook-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
LOCAL_IMAGE_NAME="${LOCAL_IMAGE_NAME:-trailbook-api}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_IMAGE="${ECR_REPOSITORY_URI}:${IMAGE_TAG}"

echo "Building ${LOCAL_IMAGE_NAME}:${IMAGE_TAG}"
docker build -f "${ROOT_DIR}/server/Dockerfile" -t "${LOCAL_IMAGE_NAME}:${IMAGE_TAG}" "${ROOT_DIR}"

echo "Tagging ${REMOTE_IMAGE}"
docker tag "${LOCAL_IMAGE_NAME}:${IMAGE_TAG}" "${REMOTE_IMAGE}"

echo "Logging in to ECR ${ECR_REPOSITORY_URI}"
aws ecr get-login-password --region "${AWS_REGION}" --profile "${AWS_PROFILE}" \
  | docker login --username AWS --password-stdin "${ECR_REPOSITORY_URI%/*}"

echo "Pushing ${REMOTE_IMAGE}"
docker push "${REMOTE_IMAGE}"

echo "Pushed ${REMOTE_IMAGE}"
