import { createApp } from "./app/create-app";

async function bootstrap() {
  const app = await createApp();

  await app.listen(Number(process.env.PORT || 3001));
}

void bootstrap();
