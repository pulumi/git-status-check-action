import * as git from "isomorphic-git";
import { promises as fs } from "fs";
import pm from "picomatch";
import { createPatch } from "diff";
import { debug, group, type AnnotationProperties } from "@actions/core";
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
  debug(`Options:
  sha: ${options.sha}
  dir: ${options.dir}
  ignoreNewFiles: ${options.ignoreNewFiles}
  allowedChanges:
    ${options.allowedChanges.join("\n    ")}`);

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
    const getOld = async () => {
      const originalBlob = await git.readBlob({
        fs,
        dir: options.dir,
        oid: options.sha,
        filepath: path,
      });
      return new TextDecoder().decode(originalBlob.blob);
    };
    const getNew = async () => {
      return fs.readFile(join(options.dir, path), "utf-8");
    };
    const modification = getModification(head, work, stage);
    switch (modification) {
      case "added":
        await group(`${path} --- file added`, async () => {
          const newContent = await getNew();
          options.alert(newContent, {
            file: path,
            title: `Unexpected file added`,
          });
        });
        break;
      case "deleted":
        await group(`${path} --- file deleted`, async () => {
          const oldFile = await getOld();
          options.alert(oldFile, {
            file: path,
            title: `Unexpected file deleted`,
          });
        });
        break;
      case "modified":
        await group(`${path} --- file modified`, async () => {
          const original = await getOld();
          const modified = await getNew();
          const patch = createPatch(path, original, modified);
          options.alert(patch, {
            file: path,
            title: `Unexpected file modified`,
          });
        });
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
