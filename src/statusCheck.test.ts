import { statusCheck } from "./statusCheck";
import { promises as fs } from "fs";
import * as git from "isomorphic-git";

describe("diffing", () => {
  beforeAll(async () => fs.mkdir(".temp", { recursive: true }));
  let tempDir: string;
  let sha: string;
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(".temp/git-status-check-test-");
    await git.init({ fs, dir: tempDir });
    await fs.writeFile(`${tempDir}/a.txt`, "Line 1\nLine 2\nLine 3\n", "utf-8");
    await fs.writeFile(`${tempDir}/.gitignore`, "ignored.txt\n");
    await git.add({ fs, dir: tempDir, filepath: ["a.txt", ".gitignore"] });
    const commitOp = await git.commit({
      fs,
      dir: tempDir,
      message: "Initial commit",
      author: { name: "Test", email: "test@example.test" },
    });
    sha = await git.resolveRef({ fs, dir: tempDir, ref: "HEAD" });
  });
  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true });
  });
  test("no changes", async () => {
    const alert = jest.fn();
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(0);
    expect(alert).not.toHaveBeenCalled();
  });
  test("new file", async () => {
    const alert = jest.fn();
    await fs.writeFile(`${tempDir}/b.txt`, "Extra file");
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    expect(alert).toHaveBeenCalledWith("```\nExtra file\n```", {
      file: "b.txt",
      title: "Unexpected new file: b.txt",
    });
  });
  test("deleted file", async () => {
    const alert = jest.fn();
    await fs.rm(`${tempDir}/a.txt`);
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    expect(alert).toHaveBeenCalledWith("This file has been deleted", {
      file: "a.txt",
      title: "Unexpected file deletion: a.txt",
    });
  });
  test("modified file", async () => {
    const alert = jest.fn();
    await fs.writeFile(`${tempDir}/a.txt`, "Line 1\nLine 3\n", "utf-8");
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    expect(alert).toHaveBeenCalledWith(
      "```diff\n Line 1\n-Line 2\n Line 3\n```",
      {
        file: "a.txt",
        title: "Unexpected change: a.txt",
        startLine: 1,
        endLine: 4,
      }
    );
  });
  test("adheres to .gitignore", async () => {
    const alert = jest.fn();
    await fs.writeFile(`${tempDir}/ignored.txt`, "Extra file");
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(0);
    expect(alert).not.toHaveBeenCalled();
  });
  test("allowed changes", async () => {
    const alert = jest.fn();
    await fs.writeFile(`${tempDir}/a.txt`, "Line 1\nLine 3\n", "utf-8");
    await fs.writeFile(`${tempDir}/a.new`, "New file", "utf-8");
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: ["a.txt", "*.new"],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(0);
    expect(alert).not.toHaveBeenCalled();
  });
});
