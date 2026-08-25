import * as Application from 'expo-application';
import { appEnvironmentForApplicationId } from './appEnvironmentId';

const PROD_APPLICATION_ID = 'com.slavisacicovic.trailbook';

export const APP_ENVIRONMENT = appEnvironmentForApplicationId(
  Application.applicationId ?? PROD_APPLICATION_ID,
);

export const OAUTH_SCHEME = APP_ENVIRONMENT === 'prod'
  ? 'trailbook'
  : `trailbook-${APP_ENVIRONMENT}`;
