import { statusCheck } from "./statusCheck";
import { promises as fs } from "fs";
import * as git from "isomorphic-git";

describe("diffing", () => {
  beforeAll(async () => fs.mkdir(".temp", { recursive: true }));
  const originalContent = "Line 1\nLine 2\nLine 3\n";
  let tempDir: string;
  let sha: string;
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(".temp/git-status-check-test-");
    await git.init({ fs, dir: tempDir });
    await fs.writeFile(`${tempDir}/a.txt`, originalContent, "utf-8");
    await fs.writeFile(`${tempDir}/.gitignore`, "ignored.txt\n");
    await fs.mkdir(`${tempDir}/emptydir`);
    await fs.mkdir(`${tempDir}/dir`);
    await fs.writeFile(`${tempDir}/dir/nested.txt`, "Nested file");
    await git.add({
      fs,
      dir: tempDir,
      filepath: ["a.txt", ".gitignore", "dir/nested.txt"],
    });
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
    const newFileContent = "Extra file";
    await fs.writeFile(`${tempDir}/b.txt`, newFileContent);
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    expect(alert).toHaveBeenCalledWith("File added:\n" + newFileContent, {
      file: "b.txt",
      title: "Unexpected file added",
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
    expect(alert).toHaveBeenCalledWith("File deleted:\n" + originalContent, {
      file: "a.txt",
      title: "Unexpected file deleted",
    });
  });
  test("modified file", async () => {
    const alert = jest.fn();
    await wait1SecondForNewTimestamp();
    await fs.writeFile(`${tempDir}/a.txt`, "Line 1\nLine 3\nLine 4\n", "utf-8");
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    const expectedPatch = `File modified:
@@ -1,3 +1,3 @@
 Line 1
-Line 2
 Line 3
+Line 4
`;
    expect(alert).toHaveBeenCalledWith(expectedPatch, {
      file: "a.txt",
      title: "Unexpected file modified",
    });
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
    await wait1SecondForNewTimestamp();
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
  test("new directory", async () => {
    const alert = jest.fn();
    await fs.mkdir(`${tempDir}/newdir`);
    await fs.writeFile(`${tempDir}/newdir/a.txt`, "Extra file");
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    expect(alert).toHaveBeenCalledWith("Directory added:\na.txt", {
      file: "newdir/",
      title: "Unexpected directory added",
    });
  });
  test("deleted directory", async () => {
    const alert = jest.fn();
    await fs.rm(`${tempDir}/dir`, { recursive: true });
    // Run statusCheck
    const unexpectedChangesCount = await statusCheck({
      sha,
      dir: tempDir,
      allowedChanges: [],
      ignoreNewFiles: false,
      alert,
    });
    expect(unexpectedChangesCount).toBe(1);
    expect(alert).toHaveBeenCalledWith("File deleted:\nNested file", {
      file: "dir/nested.txt",
      title: "Unexpected file deleted",
    });
  });
});

async function wait1SecondForNewTimestamp() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
