import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createTempProject(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "packguard-test-"));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content);
  }
  return root;
}

export async function removeTempProject(root) {
  await fs.rm(root, { recursive: true, force: true });
}
