import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "../schemas/application";
import {
  listApplications,
  getApplication,
  createApplication,
  updateApplication,
  deleteApplication,
} from "../db/applications-repo";

const idParamSchema = z.object({ id: z.string().uuid() });

export const applicationsRoute = new Hono()
  .get("/", async (c) => {
    const result = await listApplications();
    if (!result.ok) {
      return c.json({ error: "Failed to list applications" }, 500);
    }
    return c.json(result.value);
  })

  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    const result = await getApplication(id);
    if (!result.ok) {
      return c.json({ error: "Failed to fetch application" }, 500);
    }
    if (!result.value) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(result.value);
  })

  // zValidator rejects malformed bodies before this handler ever runs —
  // e.g. status.stage = "offer" with no offerAmount type mismatch, or a
  // company field that's an empty string. c.req.valid("json") is fully
  // typed as CreateApplicationInput, no `as` casts needed.
  .post("/", zValidator("json", createApplicationSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await createApplication(input);
    if (!result.ok) {
      return c.json({ error: "Failed to create application" }, 500);
    }
    return c.json(result.value, 201);
  })

  .patch(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateApplicationSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const result = await updateApplication(id, input);
      if (!result.ok) {
        return c.json({ error: "Failed to update application" }, 500);
      }
      if (!result.value) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json(result.value);
    },
  )

  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    const result = await deleteApplication(id);
    if (!result.ok) {
      return c.json({ error: "Failed to delete application" }, 500);
    }
    if (!result.value) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.body(null, 204);
  });
