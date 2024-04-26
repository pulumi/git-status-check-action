import {
  setFailed,
  getInput,
  getMultilineInput,
  setOutput,
  warning,
  error,
} from "@actions/core";
import { statusCheck } from "./statusCheck";
import { context } from "@actions/github";
import { join } from "path";

(async () => {
  try {
    const allowedChanges = getMultilineInput("allowed-changes");
    const ignoreNewFiles = getInput("ignore-new-files") === "true";
    const continueWithUnexpectedChanges =
      getInput("continue-with-unexpected-changes") === "true";
    const unexpectedChangesCount = await statusCheck({
      sha: context.sha,
      dir: join((context as any).workspace ?? ".", getInput("dir") ?? ""),
      allowedChanges,
      ignoreNewFiles,
      alert: continueWithUnexpectedChanges ? warning : error,
    });
    setOutput("unexpected-changes-count", unexpectedChangesCount);
    if (!continueWithUnexpectedChanges && unexpectedChangesCount > 0) {
      setFailed(
        `Unexpected changes detected: ${unexpectedChangesCount}. See file annotations for details.`
      );
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      setFailed(error);
    } else {
      setFailed(`An unknown error occurred: ${error}`);
    }
  }
})();
