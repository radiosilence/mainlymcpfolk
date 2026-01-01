#!/usr/bin/env bun
/**
 * Folk knowledge quiz - tests the MCP server's ability to answer real folk questions
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface QuizQuestion {
	question: string;
	searchQuery: string;
	tool: string;
	toolArgs: Record<string, string>;
	validate: (result: string) => { pass: boolean; info: string };
}

const questions: QuizQuestion[] = [
	{
		question: "What Child Ballad number is Tam Lin?",
		searchQuery: "tam lin",
		tool: "child_ballads",
		toolArgs: { filter: "tam lin" },
		validate: (r) => ({
			pass: r.includes("Child 39"),
			info: r.includes("39") ? "Child 39 - correct!" : "Should be Child 39",
		}),
	},
	{
		question: "What's the Child Ballad number for Barbara Allen?",
		searchQuery: "barbara allen",
		tool: "child_ballads",
		toolArgs: { filter: "barbara" },
		validate: (r) => ({
			pass: r.includes("84"),
			info: r.includes("84") ? "Child 84 - correct!" : "Should be Child 84",
		}),
	},
	{
		question: "Is Martin Carthy listed on the site?",
		searchQuery: "martin carthy",
		tool: "search_folk",
		toolArgs: { query: "Martin Carthy" },
		validate: (r) => ({
			pass: r.toLowerCase().includes("carthy"),
			info: r.includes("Carthy")
				? "Found Martin Carthy"
				: "Should find Martin Carthy",
		}),
	},
	{
		question: "Can we find Steeleye Span?",
		searchQuery: "steeleye span",
		tool: "search_folk",
		toolArgs: { query: "Steeleye Span" },
		validate: (r) => ({
			pass: r.toLowerCase().includes("steeleye"),
			info: r.includes("Steeleye")
				? "Found Steeleye Span"
				: "Should find Steeleye Span",
		}),
	},
	{
		question: "Is Topic Records in the label list?",
		searchQuery: "topic",
		tool: "record_labels",
		toolArgs: {},
		validate: (r) => ({
			pass: r.includes("Topic"),
			info: r.includes("Topic")
				? "Found Topic Records"
				: "Should list Topic Records",
		}),
	},
	{
		question: "What Laws Index code is The Crafty Ploughboy?",
		searchQuery: "crafty ploughboy",
		tool: "laws_index",
		toolArgs: { filter: "ploughboy" },
		validate: (r) => ({
			pass: r.includes("L1"),
			info: r.includes("L1") ? "Laws L1 - correct!" : "Should be Laws L1",
		}),
	},
	{
		question: "Can we find info on Shirley Collins?",
		searchQuery: "shirley collins",
		tool: "artist_discography",
		toolArgs: { artist: "Shirley Collins" },
		validate: (r) => ({
			pass:
				r.toLowerCase().includes("shirley") ||
				r.toLowerCase().includes("collins"),
			info:
				r.includes("Collins") || r.includes("Shirley")
					? "Found Shirley Collins discography"
					: "Should find Shirley Collins",
		}),
	},
	{
		question: "What's Child Ballad 12 (Lord Randal)?",
		searchQuery: "lord randal",
		tool: "child_ballads",
		toolArgs: { filter: "12" },
		validate: (r) => ({
			pass:
				r.includes("12") &&
				(r.toLowerCase().includes("randal") ||
					r.toLowerCase().includes("henry")),
			info: r.includes("12")
				? "Found Child 12"
				: "Should find Child 12 (Lord Randal)",
		}),
	},
];

async function main() {
	console.log("🎻 FOLK KNOWLEDGE QUIZ 🎻\n");
	console.log(
		"Testing the MCP server's knowledge of British folk tradition...\n",
	);

	const transport = new StdioClientTransport({
		command: "bun",
		args: ["run", "src/index.ts"],
	});

	const client = new Client({ name: "folk-quiz", version: "1.0.0" });
	await client.connect(transport);

	let passed = 0;
	const results: Array<{ q: string; pass: boolean; info: string }> = [];

	for (const q of questions) {
		try {
			const res = await client.callTool({
				name: q.tool,
				arguments: q.toolArgs,
			});
			const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
			const { pass, info } = q.validate(text);

			if (pass) passed++;
			results.push({ q: q.question, pass, info });

			console.log(`${pass ? "✓" : "✗"} ${q.question}`);
			console.log(`  → ${info}\n`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			results.push({ q: q.question, pass: false, info: `Error: ${msg}` });
			console.log(`✗ ${q.question}`);
			console.log(`  → Error: ${msg}\n`);
		}
	}

	await client.close();

	console.log("=".repeat(50));
	console.log(
		`\n🎵 Quiz Results: ${passed}/${questions.length} questions answered correctly\n`,
	);

	if (passed === questions.length) {
		console.log(
			"The folk oracle knows its stuff! Ready to educate about British folk tradition.",
		);
	} else if (passed >= questions.length * 0.7) {
		console.log("Pretty good! The oracle knows most of its folk.");
	} else {
		console.log("Some gaps in knowledge - might need some tuning.");
	}
}

main().catch(console.error);
