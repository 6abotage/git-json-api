import { Hono } from "hono";

// Create a new Hono app
const app = new Hono();

// Define a "Hello World" endpoint
app.get("/", (c) => {
  return c.text("Hello, World!");
});

// Start the server
export default {
  port: 3000,
  fetch: app.fetch,
};
