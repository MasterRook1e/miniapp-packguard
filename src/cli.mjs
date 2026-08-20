import fs from "node:fs/promises";
import path from "node:path";
import { auditProject } from "./audit.mjs";
import { createExampleConfig, loadConfig } from "./config.mjs";
import { writeBaseline } from "./baseline.mjs";
import { renderReport } from "./reporters.mjs";
import { stableStringify, writeTextAtomic } from "./util.mjs";
import { TOOL_VERSION } from "./version.mjs";

const HELP = `miniapp-packguard [audit|init] [options]

Commands:
  audit                         Audit a mini-app package (default)
  init                          Write miniapp-packguard.config.json

Options:
  --project-root <path>         Repository/workspace root (default: cwd)
  --config <path>               Config path relative to project root
  --root <path>                 Override config.root
  --mode <git|fs>               Override discovery mode
  --format <console|json|markdown|sarif>
  --out <path>                  Write one report file
  --report-dir <path>           Write report.json, report.md, report.sarif
  --baseline <path>             Override baseline input path
  --write-baseline <path>       Write a baseline after auditing
  --changed-since <git-ref>     Mark files changed since ref
  --fail-level <note|warning|error|off>
  --quiet                       Suppress stdout report
  --force                       Overwrite config during init
  --version                     Print version
  --help                        Print help

Exit codes: 0 pass, 1 policy failure, 2 configuration/runtime error.
`;

function parseArgs(argv) {
  const options = { command: "audit", format: "console", projectRoot: process.cwd(), quiet: false, force: false };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) options.command = args.shift();
  const boolean = new Set(["--quiet", "--force", "--help", "--version"]);
  while (args.length) {
    const key = args.shift();
    if (boolean.has(key)) {
      options[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
      continue;
    }
    if (!key?.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    const value = args.shift();
    if (value == null) throw new Error(`missing value for ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    options[name] = value;
  }
  return options;
}

async function initProject(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const configPath = path.resolve(projectRoot, options.config || "miniapp-packguard.config.json");
  try {
    if (!options.force) await fs.access(configPath).then(() => { throw new Error(`${path.basename(configPath)} already exists; pass --force to overwrite`); });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeTextAtomic(configPath, stableStringify(createExampleConfig()));
  process.stdout.write(`Wrote ${configPath}\n`);
}

export async function runCli(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return;
  }
  if (options.command === "init") {
    await initProject(options);
    return;
  }
  if (options.command !== "audit") throw new Error(`unknown command: ${options.command}`);
  const overrides = {};
  if (options.root) overrides.root = options.root;
  if (options.mode) overrides.mode = options.mode;
  if (options.failLevel) overrides.failLevel = options.failLevel;
  const loaded = await loadConfig({ projectRoot: options.projectRoot, configPath: options.config, overrides });
  const result = await auditProject({
    projectRoot: loaded.projectRoot,
    scanRoot: loaded.scanRoot,
    config: loaded.config,
    changedSince: options.changedSince || null,
    baselinePath: options.baseline || null
  });
  if (options.writeBaseline) {
    await writeBaseline(path.resolve(loaded.projectRoot, options.writeBaseline), result);
  }
  if (options.reportDir) {
    const reportDir = path.resolve(loaded.projectRoot, options.reportDir);
    await Promise.all([
      writeTextAtomic(path.join(reportDir, "report.json"), renderReport(result, "json")),
      writeTextAtomic(path.join(reportDir, "report.md"), renderReport(result, "markdown")),
      writeTextAtomic(path.join(reportDir, "report.sarif"), renderReport(result, "sarif"))
    ]);
  }
  const rendered = renderReport(result, options.format);
  if (options.out) await writeTextAtomic(path.resolve(loaded.projectRoot, options.out), rendered);
  if (!options.quiet) process.stdout.write(rendered);
  process.exitCode = result.summary.passed ? 0 : 1;
}
