import { Plugin } from "@opencode/plugin";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * OpenCode Conductor — Context-Driven Development workflow.
 *
 * V2 plugin entrypoint. Registers a set of tools that manage a project-local
 * `conductor/` directory (context files and development tracks).
 */
export default Plugin.define({
  id: "opencode-conductor",

  async setup(ctx) {
    // Directory where this plugin instance loaded (the project root for a
    // project-level config). All conductor paths are resolved relative to it.
    const baseDir = ctx.location.directory;
    const conductorDir = path.join(baseDir, "conductor");
    const tracksDir = path.join(conductorDir, "tracks");

    // Tool transforms are replayable state edits: keep the callback
    // synchronous and free of one-time side effects.
    await ctx.tool.transform((editor) => {
      // conductor_init - Scaffold conductor/ directory with context files
      editor.add({
        name: "conductor_init",
        description: "Initialize project with Conductor context files",
        input: {
          type: "object",
          properties: {
            product: {
              type: "string",
              description: "Initial product mission/context",
            },
            techStack: {
              type: "string",
              description: "Initial tech stack details",
            },
            workflow: {
              type: "string",
              description: "Initial workflow standards",
            },
          },
          additionalProperties: false,
        },
        async execute(input) {
          const { product, techStack, workflow } = input as Record<
            string,
            string | undefined
          >;

          if (!fs.existsSync(conductorDir)) {
            fs.mkdirSync(conductorDir, { recursive: true });
          }
          if (!fs.existsSync(tracksDir)) {
            fs.mkdirSync(tracksDir, { recursive: true });
          }

          const files: Array<[string, string]> = [
            [
              "product.md",
              product
                ? `# Product Context\n${product}`
                : "# Product Context\nDescribe the product mission and value proposition.",
            ],
            [
              "tech-stack.md",
              techStack
                ? `# Tech Stack\n${techStack}`
                : "# Tech Stack\nList the technologies, frameworks, and tools used.",
            ],
            [
              "workflow.md",
              workflow
                ? `# Workflow\n${workflow}`
                : "# Workflow\nDescribe development processes and standards.",
            ],
            ["tracks.md", "# Tracks Index\nList of all development tracks."],
          ];

          for (const [name, content] of files) {
            const filePath = path.join(conductorDir, name);
            if (!fs.existsSync(filePath)) {
              fs.writeFileSync(filePath, content);
            }
          }

          return { content: "Conductor initialized successfully." };
        },
      });

      // conductor_create_track - Create a new track (spec, plan, metadata)
      editor.add({
        name: "conductor_create_track",
        description: "Create a new development track",
        input: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique ID for the track (e.g., feat-login)",
            },
            title: { type: "string", description: "Title of the track" },
          },
          required: ["id", "title"],
          additionalProperties: false,
        },
        async execute(input) {
          const { id, title } = input as { id: string; title: string };
          const trackPath = path.join(tracksDir, id);

          if (fs.existsSync(trackPath)) {
            throw new Error(`Track ${id} already exists.`);
          }

          fs.mkdirSync(trackPath, { recursive: true });
          fs.writeFileSync(
            path.join(trackPath, "spec.md"),
            `# Spec: ${title}\n## Goals\n## Requirements`,
          );
          fs.writeFileSync(
            path.join(trackPath, "plan.md"),
            `# Plan: ${title}\n## Tasks\n- [ ] Task 1`,
          );
          fs.writeFileSync(
            path.join(trackPath, "metadata.json"),
            JSON.stringify(
              {
                id,
                title,
                status: "pending",
                created_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          );

          const tracksFile = path.join(conductorDir, "tracks.md");
          if (!fs.existsSync(tracksFile)) {
            fs.writeFileSync(
              tracksFile,
              "# Tracks Index\nList of all development tracks.",
            );
          }
          const tracksContent = fs.readFileSync(tracksFile, "utf8");
          fs.writeFileSync(tracksFile, `${tracksContent}\n- [ ] ${id}: ${title}`);

          return { content: `Track ${id} created at ${trackPath}` };
        },
      });

      // conductor_get_context - Read all context files
      editor.add({
        name: "conductor_get_context",
        description: "Read all Conductor context files",
        input: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          let context = "";
          for (const file of [
            "product.md",
            "tech-stack.md",
            "workflow.md",
            "tracks.md",
          ]) {
            const filePath = path.join(conductorDir, file);
            if (fs.existsSync(filePath)) {
              context += `\n--- ${file} ---\n${fs.readFileSync(filePath, "utf8")}\n`;
            }
          }
          return {
            content:
              context || "Conductor context not found yet. Run /conductor-setup.",
          };
        },
      });

      // conductor_read_plan - Get a track's plan
      editor.add({
        name: "conductor_read_plan",
        description: "Read the plan for a specific track",
        input: {
          type: "object",
          properties: { id: { type: "string", description: "Track ID" } },
          required: ["id"],
          additionalProperties: false,
        },
        async execute(input) {
          const { id } = input as { id: string };
          const planPath = path.join(tracksDir, id, "plan.md");
          if (!fs.existsSync(planPath)) {
            throw new Error(`Plan for track ${id} not found.`);
          }
          return { content: fs.readFileSync(planPath, "utf8") };
        },
      });

      // conductor_update_task - Mark a task complete
      editor.add({
        name: "conductor_update_task",
        description: "Mark a task as completed in a track's plan",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Track ID" },
            taskName: {
              type: "string",
              description: "The exact text of the task to mark as complete",
            },
          },
          required: ["id", "taskName"],
          additionalProperties: false,
        },
        async execute(input) {
          const { id, taskName } = input as { id: string; taskName: string };
          const planPath = path.join(tracksDir, id, "plan.md");
          if (!fs.existsSync(planPath)) {
            throw new Error(`Plan for track ${id} not found.`);
          }

          const content = fs.readFileSync(planPath, "utf8");
          const updatedContent = content.replace(
            new RegExp(`- \\[ \\] ${taskName}`, "g"),
            `- [x] ${taskName}`,
          );

          if (content === updatedContent) {
            return {
              content: `Task "${taskName}" not found or already completed.`,
            };
          }

          fs.writeFileSync(planPath, updatedContent);
          return {
            content: `Task "${taskName}" marked as completed in track ${id}.`,
          };
        },
      });
    });
  },
});
