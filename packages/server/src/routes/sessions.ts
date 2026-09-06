import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { orm } from "@cattiva/database";
import { MESSAGE_FIELDS } from "../lib/messages";

const LOCAL_USER_ID = "local";

const app = new Hono()
  .get("/", async (c) => {
    const sessions = await orm.Session.where({ userId: LOCAL_USER_ID })
      .select("id", "title", "createdAt")
      .orderBy((s) => s.createdAt.desc())
      .all();

    return c.json(sessions);
  })
  .get("/:id", async (c) => {
    const session = await orm.Session.where({ id: c.req.param("id") })
      .select("id", "title", "cwd", "createdAt", "updatedAt")
      .include("messages", (message) =>
        message.select(...MESSAGE_FIELDS).orderBy((m) => m.createdAt.asc()),
      )
      .first();

    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    return c.json(session);
  });

export default app;
