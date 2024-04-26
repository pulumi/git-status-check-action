import * as git from "isomorphic-git";
import { promises as fs } from "fs";
import pm from "picomatch";
import { structuredPatch } from "diff";
import type { AnnotationProperties } from "@actions/core";
import { join } from "path";

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
  const isAllowed = pm(options.allowedChanges);
  const status = await git.statusMatrix({
    fs,
    dir: options.dir,
    filter: (path) => {
      if (isAllowed(path)) return false;
      return true;
    },
  });

  let unexpectedChangesCount = 0;
  // ["a.txt", 0, 2, 0], // new, untracked
  // ["b.txt", 0, 2, 2], // added, staged
  // ["c.txt", 0, 2, 3], // added, staged, with unstaged changes
  // ["d.txt", 1, 1, 1], // unmodified
  // ["e.txt", 1, 2, 1], // modified, unstaged
  // ["f.txt", 1, 2, 2], // modified, staged
  // ["g.txt", 1, 2, 3], // modified, staged, with unstaged changes
  // ["h.txt", 1, 0, 1], // deleted, unstaged
  // ["i.txt", 1, 0, 0], // deleted, staged
  // ["j.txt", 1, 2, 0], // deleted, staged, with unstaged-modified changes (new file of the same name)
  // ["k.txt", 1, 1, 0], // deleted, staged, with unstaged changes (new file of the same name)
  for (const [path, head, work, stage] of status) {
    if (head === 1 && work === 1 && stage === 1) {
      continue; // Unmodified
    }
    if (options.ignoreNewFiles && head === 0) {
      continue;
    }
    const modification = getModification(head, work, stage);
    switch (modification) {
      case "added":
        const newContent = await fs.readFile(join(options.dir, path), "utf-8");
        options.alert(codeFence(newContent), {
          file: path,
          title: `Unexpected new file: ${path}`,
        });
        break;
      case "deleted":
        options.alert("This file has been deleted", {
          file: path,
          title: `Unexpected file deletion: ${path}`,
        });
        break;
      case "modified":
        const originalBlob = await git.readBlob({
          fs,
          dir: options.dir,
          oid: options.sha,
          filepath: path,
        });
        const original = new TextDecoder().decode(originalBlob.blob);
        const modified = await fs.readFile(join(options.dir, path), "utf-8");
        const diff = structuredPatch(path, path, original, modified);
        for (const hunk of diff.hunks) {
          options.alert(codeFence(hunk.lines.join("\n"), "diff"), {
            file: path,
            startLine: hunk.oldStart,
            endLine: hunk.oldStart + hunk.oldLines,
            title: `Unexpected change: ${path}`,
          });
        }
        break;
    }
    unexpectedChangesCount++;
  }
  return unexpectedChangesCount;
}

function codeFence(code: string, format?: string): string {
  return "```" + (format ?? "") + "\n" + code + "\n```";
}

function getModification(head: 0 | 1, work: 0 | 1 | 2, stage: 0 | 1 | 2 | 3) {
  if (head === 0) {
    return "added";
  }
  if (work === 2) {
    return "modified";
  }
  if (work === 0 || stage === 0) {
    return "deleted";
  }
  return "unmodified";
}
