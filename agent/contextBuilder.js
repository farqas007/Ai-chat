import { FileRanker } from "./fileRanker.js";
import { DependencyGraph } from "./dependencyGraph.js";


export class ContextBuilder {

    constructor(limit = 30) {
        this.dependencyGraph = new DependencyGraph();

        this.fileRanker = new FileRanker();

        this.limit = limit;

    }

    build(messages = []) {

        if (!Array.isArray(messages)) {

            return [];

        }

        if (messages.length <= this.limit) {

            return messages;

        }

        return messages.slice(-this.limit);

    }

    systemPrompt(project = {}) {

        return {

            role: "system",

            content:
`You are CodeAgent.

Current Framework: ${project.framework || "Unknown"}

Three.js: ${project.hasThreeJS ? "Yes" : "No"}

Tailwind: ${project.hasTailwind ? "Yes" : "No"}

Always modify the existing project.

Never recreate the whole project.

Keep coding style consistent.

Do not remove existing features.

Return only the required changes.`

        };

    }

    buildPrompt(project, messages) {

        return [

            this.systemPrompt(project),

            ...this.build(messages)

        ];

    }
    buildWithMemory(

    project,

    recent,

    memories

) {

    return [

        this.systemPrompt(project),

        ...memories,

        ...this.build(recent)

    ];

}
buildComplete(

    project,

    summary,

    memories,

    recent

) {

    const context = [

        this.systemPrompt(project)

    ];

    if (summary) {

        context.push(summary);

    }

    context.push(

        ...memories,

        ...this.build(recent)

    );

    return context;

}

findRelevantFiles(task = "", files = []) {

    if (!Array.isArray(files)) {

        return [];

    }

    const keywords = task
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    return files
        .map(file => ({

            file,

            score: this.scoreFile(file, keywords)

        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(item => item.file);

}



scoreFile(file, keywords = []) {

    const name = file.toLowerCase();

    let score = 0;

    for (const word of keywords) {

        if (name.includes(word)) {

            score += 10;

        }

    }

    if (name.includes("index")) score += 5;

    if (name.includes("main")) score += 5;

    if (name.includes("app")) score += 5;

    if (name.includes("style")) score += 4;

    if (name.includes("voice")) score += 8;

    if (name.includes("chat")) score += 8;

    if (name.includes("api")) score += 8;

    if (name.includes("memory")) score += 6;

    return score;

}



buildProjectContext(task, project = {}) {

    const graph = this.dependencyGraph.build(
        project.files || []
    );

    const ranked = this.fileRanker.rank(
        task,
        project.files || []
    );

    const relevant = ranked.slice(0, 10);

    return {

        task,

        framework: project.framework || "Unknown",

        hasThreeJS: project.hasThreeJS || false,

        hasTailwind: project.hasTailwind || false,

        relevantFiles: relevant,

        dependencyGraph: graph

    };

}
}
