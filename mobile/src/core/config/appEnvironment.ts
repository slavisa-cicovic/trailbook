import * as Application from 'expo-application';
import { appEnvironmentForApplicationId, oauthSchemeForApplicationId } from './appEnvironmentId';

const PROD_APPLICATION_ID = 'com.slavisacicovic.trailbook';

const applicationId = Application.applicationId ?? PROD_APPLICATION_ID;
export const APP_ENVIRONMENT = appEnvironmentForApplicationId(applicationId);

export const OAUTH_SCHEME = oauthSchemeForApplicationId(applicationId);
