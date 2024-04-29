import { promises as fs } from "fs";
import pm from "picomatch";
import {
  debug,
  group,
  warning,
  type AnnotationProperties,
} from "@actions/core";
import { join } from "path";
import { exec } from "shelljs";

export interface StatusCheckOptions {
  sha: string;
  dir: string;
  allowedChanges: string[];
  ignoreNewFiles: boolean;
  alert: (message: string | Error, properties?: AnnotationProperties) => void;
}

export async function statusCheck(
  options: StatusCheckOptions
): Promise<number> {
  debug(`Options:
  sha: ${options.sha}
  dir: ${options.dir}
  ignoreNewFiles: ${options.ignoreNewFiles}
  allowedChanges:
    ${options.allowedChanges.join("\n    ")}`);

  const isAllowed = pm(options.allowedChanges);
  const gitStatus = exec("git status --porcelain", { cwd: options.dir });

  let unexpectedChangesCount = 0;
  /* | HEAD | WORKDIR | STAGE | `git status --short` equivalent |
   * | ---- | ------- | ----- | ------------------------------- |
   * | 0    | 0       | 0     | ``                              |
   * | 0    | 0       | 3     | `AD`                            |
   * | 0    | 2       | 0     | `??`                            |
   * | 0    | 2       | 2     | `A `                            |
   * | 0    | 2       | 3     | `AM`                            |
   * | 1    | 0       | 0     | `D `                            |
   * | 1    | 0       | 1     | ` D`                            |
   * | 1    | 0       | 3     | `MD`                            |
   * | 1    | 1       | 0     | `D ` + `??`                     |
   * | 1    | 1       | 1     | ``                              |
   * | 1    | 1       | 3     | `MM`                            |
   * | 1    | 2       | 0     | `D ` + `??`                     |
   * | 1    | 2       | 1     | ` M`                            |
   * | 1    | 2       | 2     | `M `                            |
   * | 1    | 2       | 3     | `MM`                            |
   */
  const getOld = (path: string) => {
    return exec(`git show ${options.sha}:"${path}"`, { cwd: options.dir })
      .stdout;
  };
  const getNew = async (path: string) => {
    return fs.readFile(join(options.dir, path), "utf-8");
  };
  const getDiff = (path: string) => {
    return exec(`git diff --no-ext-diff -p "${path}"`, { cwd: options.dir })
      .stdout;
  };
  const statusLines = gitStatus.stdout.split("\n");
  for (const statusLine of statusLines) {
    const parsed = parseStatusLine(statusLine);
    if (parsed === undefined) {
      continue;
    }
    const { path, status } = parsed;
    if (isAllowed(path)) {
      continue;
    }
    const modification = getModification(status);
    if (modification === "added" && options.ignoreNewFiles) {
      continue;
    }
    if (modification === undefined) {
      warning(`unhandled status: ${statusLine}`);
      continue;
    }
    await group(statusLine, async () => {
      switch (modification) {
        case "added":
          const newContent = await getNew(path);
          options.alert("File added:\n" + newContent, {
            file: path,
            title: `Unexpected file added`,
          });
          break;
        case "deleted":
          // Deleted
          const oldFile = getOld(path);
          options.alert("File deleted:\n" + oldFile, {
            file: path,
            title: `Unexpected file deleted`,
          });
          break;
        case "modified":
          // Modified
          const diff = getDiff(path);
          options.alert("File modified:\n" + trimPatchHeader(diff), {
            file: path,
            title: `Unexpected file modified`,
          });
          break;
      }
      unexpectedChangesCount++;
    });
  }
  return unexpectedChangesCount;
}

const statusPattern = new RegExp(/(\S+)\s+(.*)/);
function parseStatusLine(
  line: string
): { status: string; path: string } | undefined {
  const match = statusPattern.exec(line);
  if (match === null) {
    return undefined;
  }
  const status = match[1];
  let path = match[2];
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.substring(1, path.length - 2);
  }
  return { path, status: status.trim() };
}

function trimPatchHeader(patch: string) {
  return patch
    .split("\n")
    .filter((l) => !isHeader(l))
    .join("\n");
}

function isHeader(line: string) {
  return (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  );
}

function getModification(status: string) {
  switch (status) {
    case "AD":
    case "??":
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
    case "MM":
      return "modified";
    default:
      return;
  }
}
