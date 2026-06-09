import { beforeEach } from "vitest";
import { resetDb } from "@/server/db";

beforeEach(() => {
  resetDb();
});
