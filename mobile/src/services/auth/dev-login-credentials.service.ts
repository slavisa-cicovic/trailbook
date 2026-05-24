import Constants from "expo-constants";

interface DevLoginCredentials {
  email: string;
  password: string;
}

export function getExpoGoDevLoginCredentials(): DevLoginCredentials | null {
  if (!__DEV__ || Constants.appOwnership !== "expo") {
    return null;
  }

  const email = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL?.trim();
  const password = process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD;

  if (!email || !password) {
    return null;
  }

  return {
    email,
    password,
  };
}
