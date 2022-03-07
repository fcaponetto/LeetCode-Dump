import fs from "node:fs";
import path from "node:path";
import { Credential, LeetCode } from "leetcode-query";
import fetch from "node-fetch";
import Ora from "ora";
import { EXTS, LEETCODE_BASE, LEETCODE_DETAIL_BASE, README_TEMPLATE } from "./constants";
import { readable_memory, retry, sleep } from "./utils";

let leetcode: LeetCode;
let max_retry = 3;

export async function dump(
    session: string,
    output: string,
    clean: boolean,
    cooldown: number,
    timezone: string,
    pure: boolean,
    max: number,
): Promise<void> {
    process.env.TZ = timezone;
    max_retry = max;

    const dir = path.resolve(output);
    if (fs.existsSync(dir) && clean) {
        fs.rmSync(dir, { recursive: true });
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const credential = new Credential();
    await credential.init(session);
    leetcode = new LeetCode(credential);

    const spinner = Ora("Scanning...").start();
    const { list, ac } = await get_list();
    spinner.succeed(`Scan Done. (${list.length} Problems, ${ac.length} Accepted)`);
    await sleep(cooldown);

    const table: [string, string, string, Map<string, string>][] = [];
    spinner.start("Dumping Submissions...");
    for (let i = 0; i < ac.length; i++) {
        spinner.text = `Dumping Submissions... (${i + 1}/${ac.length})`;
        const { titleSlug } = ac[i];
        const problem = await get_problem(titleSlug);
        const folder = path.resolve(dir, `${problem.questionFrontendId}. ${problem.title}`);
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }
        fs.writeFileSync(
            path.resolve(folder, "README.md"),
            `# ${problem.questionFrontendId}. ${problem.title}\n\nTags: ${problem.topicTags
                .map((t) => "`" + t.name + "`")
                .join(", ")}\n\n${problem.content}`,
        );
        const submissions = await get_submissions(titleSlug);
        spinner.text += ` [${Object.keys(submissions).join(", ")}]`;
        await sleep(cooldown);

        const row: [string, string, string, Map<string, string>] = [
            `${problem.questionFrontendId}. ${problem.title}`,
            problem.difficulty,
            problem.topicTags.map((t) => "`" + t.name + "`").join(", "),
            new Map(),
        ];

        for (const lang in submissions) {
            const ext = EXTS[lang];
            const file = path.resolve(folder, `${titleSlug}${ext}`);
            if (!fs.existsSync(file)) {
                const submission = await get_submission(submissions[lang].id);

                const info = `// ${problem.questionFrontendId}. ${problem.title} (${new Date(
                    +submissions[lang].timestamp * 1e3,
                ).toLocaleDateString()})\n// Runtime: ${
                    submission.runtime
                } ms (${submission.runtime_percentile.toFixed(2)}%) Memory: ${readable_memory(
                    submission.memory,
                )} (${submission.memory_percentile.toFixed(2)}%) \n\n`;

                fs.writeFileSync(file, `${pure ? "" : info}${submission.code}`);
                row[3].set(lang, `./${path.basename(folder)}/${titleSlug}${ext}`);
                await sleep(cooldown);
            }
        }

        table.push(row);
    }
    spinner.succeed("Submissions Dumped.");

    const username = (
        await retry(
            () =>
                leetcode.graphql({
                    query: `query globalData { userStatus { username } }`,
                    operationName: "globalData",
                    variables: {},
                }),
            max_retry,
        )
    ).data.userStatus.username;

    const card_url = `https://leetcode.card.workers.dev/?username=${username}`;
    const table_str = table
        .map(([title, difficulty, tags, solutions]) => {
            return `| ${title} | ${difficulty} | ${tags} | ${[...solutions.entries()]
                .map(([lang, link]) => `[${lang}](${encodeURI(link)})`)
                .join(" / ")} |`;
        })
        .join("\n");

    fs.writeFileSync(
        path.resolve(dir, "README.md"),
        README_TEMPLATE.replace("$card_url", card_url).replace("$table", table_str),
    );
}

async function get_list() {
    const ql = `query allQuestionsStatusesRaw { allQuestions: allQuestionsRaw { titleSlug questionId status } }`;
    const json = await retry(
        () =>
            leetcode.graphql({
                query: ql,
                operationName: "allQuestionsStatusesRaw",
                variables: {},
            }),
        max_retry,
    );
    const list = json.data.allQuestions as {
        titleSlug: string;
        questionId: string;
        status: string;
    }[];
    const ac = list
        .filter((item) => item.status === "ac")
        .sort((a, b) => +a.questionId - +b.questionId);
    return { list, ac };
}

async function get_problem(slug: string) {
    const ql = `
    query questionData($slug: String!) {
        question(titleSlug: $slug) {
            questionFrontendId title content difficulty similarQuestions categoryTitle stats topicTags { name slug }
        }
    }`;
    const json = (
        await retry(
            () =>
                leetcode.graphql({
                    query: ql,
                    operationName: "questionData",
                    variables: { slug },
                }),
            max_retry,
        )
    ).data.question as {
        questionFrontendId: string;
        title: string;
        content: string;
        difficulty: string;
        similarQuestions: { difficulty: string; title: string; titleSlug: string }[];
        categoryTitle: string;
        topicTags: { name: string; slug: string }[];
        stats: {
            totalAccepted: string;
            totalSubmission: string;
            totalAcceptedRaw: string;
            totalSubmissionRaw: string;
            acRate: string;
        };
    };

    json.similarQuestions = JSON.parse(json.similarQuestions as unknown as string);
    json.stats = JSON.parse(json.stats as unknown as string);

    return json;
}

async function get_submissions(slug: string) {
    const ql = `
    query Submissions($offset: Int!, $limit: Int!, $last: String, $slug: String!) {
        submissionList(offset: $offset, limit: $limit, lastKey: $last, questionSlug: $slug) {
            hasNext
            submissions { id statusDisplay lang runtime timestamp }
        }
    }`;
    const list: Record<string, { id: string; timestamp: string; runtime: string }> = {};
    for (let i = 0; i < 10; i++) {
        const json = await retry(
            () =>
                leetcode.graphql({
                    query: ql,
                    operationName: "Submissions",
                    variables: { slug, offset: 0 * 20, limit: 20 },
                }),
            max_retry,
        );
        const { submissions, hasNext } = json.data.submissionList;

        for (const submission of submissions) {
            const { id, statusDisplay, lang, runtime, timestamp } = submission;
            if (statusDisplay !== "Accepted") {
                continue;
            }
            if (!list[lang] || parseInt(runtime) < parseInt(list[lang].runtime)) {
                list[lang] = { id, timestamp, runtime };
            }
        }

        if (submissions.length === 0 || !hasNext) {
            break;
        }
    }

    return list;
}

async function get_submission(id: string) {
    const res = await retry(
        () =>
            fetch(`${LEETCODE_DETAIL_BASE}${id}/`, {
                headers: {
                    Cookie: `LEETCODE_SESSION=${leetcode.credential.session}`,
                    Referer: LEETCODE_BASE,
                },
            }),
        max_retry,
    );
    const raw = await res.text();
    const data = raw.match(/var pageData = ({[^]+?});/)?.[1];
    const json = new Function("return " + data)();
    const result = {
        runtime: +json.runtime,
        runtime_distribution: json.runtimeDistributionFormatted
            ? (JSON.parse(json.runtimeDistributionFormatted).distribution.map(
                  (item: [string, number]) => [+item[0], item[1]],
              ) as [number, number][])
            : null,
        runtime_percentile: 0,
        memory: +json.memory,
        memory_distribution: json.memoryDistributionFormatted
            ? (JSON.parse(json.memoryDistributionFormatted).distribution.map(
                  (item: [string, number]) => [+item[0], item[1]],
              ) as [number, number][])
            : null,
        memory_percentile: 0,
        code: json.submissionCode,
    };

    if (result.runtime_distribution) {
        result.runtime_percentile = result.runtime_distribution.reduce(
            (acc, [usage, p]) => acc + (usage >= result.runtime ? p : 0),
            0,
        );
    }
    if (result.memory_distribution) {
        result.memory_percentile = result.memory_distribution.reduce(
            (acc, [usage, p]) => acc + (usage >= result.memory / 1000 ? p : 0),
            0,
        );
    }

    return result;
}