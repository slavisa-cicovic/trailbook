import { appModule } from "./app/app.module";

export function bootstrap(): string {
  return `Trailbook server scaffold with ${appModule.controllers.length} controller(s)`;
}
