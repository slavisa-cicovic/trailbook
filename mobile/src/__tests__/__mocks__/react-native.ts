export const Platform = {
  OS: "ios" as const,
  select: <T>(spec: { ios?: T; android?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.default,
};
