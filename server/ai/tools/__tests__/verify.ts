import { ToolRegistry } from "../registry";
import { CalculatorTool } from "../calculator";
import { DateTimeTool } from "../datetime";
import { plan } from "../planner";
import { executeTool } from "../executor";
import type { CalculatorResult, DateTimeResult } from "../types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

async function main() {
  console.log("\n═══ Tool Engine Verification ═══\n");

  // 1. Registry
  console.log("1. Registry");
  const reg = ToolRegistry.getInstance();
  reg.clear();
  reg.register(new CalculatorTool());
  reg.register(new DateTimeTool());
  assert(reg.get("calculator") !== undefined, "get('calculator') returns tool");
  assert(reg.get("datetime") !== undefined, "get('datetime') returns tool");
  assert(reg.get("nonexistent") === undefined, "get('nonexistent') returns undefined");
  const list = reg.list();
  assert(list.length === 2, "list() returns 2 tools");
  assert(list.some((t: { name: string }) => t.name === "calculator"), "list() includes calculator");
  assert(list.some((t: { name: string }) => t.name === "datetime"), "list() includes datetime");

  let threw = false;
  try { reg.register(new CalculatorTool()); } catch { threw = true; }
  assert(threw, "duplicate register throws");

  // 2. Planner
  console.log("\n2. Planner");
  const calcReq = plan("2+2");
  assert(calcReq?.toolName === "calculator", "plan('2+2') → calculator");
  assert(calcReq?.args.a === 2 && calcReq?.args.b === 2 && calcReq?.args.operator === "+", "parses 2+2 correctly");

  const calcReq2 = plan("10 * 5");
  assert(calcReq2?.toolName === "calculator", "plan('10 * 5') → calculator");
  assert(calcReq2?.args.a === 10 && calcReq2?.args.b === 5 && calcReq2?.args.operator === "*", "parses 10 * 5");

  const calcReq3 = plan("100 / 0");
  assert(calcReq3 === null, "plan('100 / 0') → null (division by zero guard)");

  const dtReq = plan("what time is it");
  assert(dtReq?.toolName === "datetime", "plan('what time is it') → datetime");

  const dtReq2 = plan("current date");
  assert(dtReq2?.toolName === "datetime", "plan('current date') → datetime");

  const dtReq3 = plan("tell me the time");
  assert(dtReq3?.toolName === "datetime", "plan('tell me the time') → datetime");

  const noMatch = plan("hello how are you");
  assert(noMatch === null, "plan('hello how are you') → null (no match)");

  const emptyMatch = plan("");
  assert(emptyMatch === null, "plan('') → null");

  // 3. Executor + Calculator
  console.log("\n3. Executor + Calculator");
  const calcResult = await executeTool({ toolName: "calculator", args: { a: 7, b: 3, operator: "+" } });
  assert(calcResult.success === true, "7 + 3 succeeds");
  if (calcResult.success) {
    const data = calcResult.data as CalculatorResult;
    assert(data.expression === "7 + 3", "expression = '7 + 3'");
    assert(data.result === 10, "result = 10");
  }

  const calcSub = await executeTool({ toolName: "calculator", args: { a: 20, b: 4, operator: "-" } });
  assert(calcSub.success === true, "20 - 4 succeeds");
  if (calcSub.success) assert((calcSub.data as CalculatorResult).result === 16, "20 - 4 = 16");

  const calcMul = await executeTool({ toolName: "calculator", args: { a: 6, b: 7, operator: "*" } });
  assert(calcMul.success === true, "6 * 7 succeeds");
  if (calcMul.success) assert((calcMul.data as CalculatorResult).result === 42, "6 * 7 = 42");

  const calcDiv = await executeTool({ toolName: "calculator", args: { a: 15, b: 3, operator: "/" } });
  assert(calcDiv.success === true, "15 / 3 succeeds");
  if (calcDiv.success) assert((calcDiv.data as CalculatorResult).result === 5, "15 / 3 = 5");

  const calcDiv0 = await executeTool({ toolName: "calculator", args: { a: 1, b: 0, operator: "/" } });
  assert(calcDiv0.success === false, "division by zero fails");
  
  const calcBadOp = await executeTool({ toolName: "calculator", args: { a: 1, b: 2, operator: "xyz" } });
  assert(calcBadOp.success === false, "unknown operator fails");

  // 4. Executor + DateTime
  console.log("\n4. Executor + DateTime");
  const dtResult = await executeTool({ toolName: "datetime", args: {} });
  assert(dtResult.success === true, "datetime succeeds");
  if (dtResult.success) {
    const data = dtResult.data as DateTimeResult;
    assert(typeof data.date === "string" && data.date.length === 10, "date is YYYY-MM-DD");
    assert(typeof data.time === "string" && data.time.length === 8, "time is HH:MM:SS");
    assert(typeof data.iso === "string" && data.iso.includes("T"), "iso is ISO 8601");
    assert(typeof data.timezone === "string" && data.timezone.length > 0, "timezone is non-empty");
    console.log(`     date: ${data.date}`);
    console.log(`     time: ${data.time}`);
    console.log(`     iso:  ${data.iso}`);
    console.log(`     tz:   ${data.timezone}`);
  }

  // 5. Unknown tool
  console.log("\n5. Error handling");
  const unknown = await executeTool({ toolName: "nonexistent", args: {} });
  assert(unknown.success === false && unknown.error.includes("Unknown tool"), "unknown tool returns error");

  // Summary
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();