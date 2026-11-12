import { describeEnvProblems, runtimeEnvSchema, toolingEnvSchema } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Prints variable names and the rule they broke. Never prints a value: they are passwords.
runScript(async () => {
  loadEnvLocal();
  const problems = [...describeEnvProblems(process.env, runtimeEnvSchema), ...describeEnvProblems(process.env, toolingEnvSchema)];
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s) in the environment:\n${[...new Set(problems)].join("\n")}`);
    process.exit(1);
  }
  console.log("Environment OK.");
});
