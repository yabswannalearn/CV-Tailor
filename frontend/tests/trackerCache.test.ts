import test from "node:test";
import assert from "node:assert/strict";
import type { JobSummary } from "../src/lib/queries.ts";
import { patchJob, prependJob, removeJob, replaceJob } from "../src/lib/trackerCache.ts";

const first: JobSummary = {
  id: 1,
  company_name: "Acme",
  job_title: "Engineer",
  has_pdf: false,
  status: "Applied",
  priority: "High",
};

const second: JobSummary = {
  id: 2,
  company_name: "Globex",
  job_title: "Developer",
  has_pdf: false,
  status: "Saved",
  priority: "Medium",
};

test("prepends an optimistic create and reconciles it with the server record", () => {
  const optimistic = { ...second, id: -10 };
  const pending = prependJob([first], optimistic);
  assert.deepEqual(pending.map(job => job.id), [-10, 1]);
  assert.deepEqual(replaceJob(pending, -10, second), [second, first]);
});

test("patches only the targeted job", () => {
  const result = patchJob([first, second], first.id, { status: "Offer" });
  assert.equal(result[0].status, "Offer");
  assert.equal(result[1], second);
});

test("keeps the snapshot immutable so a failed mutation can roll back", () => {
  const snapshot = [first, second];
  const optimistic = patchJob(snapshot, second.id, { status: "Rejected" });
  assert.equal(optimistic[1].status, "Rejected");
  assert.deepEqual(snapshot, [first, second]);
});

test("removes only the targeted job", () => {
  assert.deepEqual(removeJob([first, second], first.id), [second]);
});
