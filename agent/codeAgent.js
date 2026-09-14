import path from "path";
import { fileURLToPath } from "url";

import { Planner } from "./planner.js";
import { FileAgent } from "./fileAgent.js";
import { ToolManager } from "./toolManager.js";
import { ProjectScanner } from "../filesystem/projectScanner.js";
import { IntentParser } from "./intentParser.js";
import { MemoryManager } from "../core/memoryManager.js";
import { ConversationManager } from "./conversationManager.js";
import { ContextBuilder } from "./contextBuilder.js";
import { MemoryRetriever } from "./memoryRetriever.js";
import { ConversationSummarizer } from "./conversationSummarizer.js";
import { FilePlanner } from "./filePlanner.js";
import { TaskGraph } from "./taskGraph.js";
import { PatchPlanner } from "./patchPlanner.js";
import { DiffEngine } from "./diffEngine.js";
import { BackupManager } from "./backupManager.js";
import { ProjectIndexer } from "./projectIndexer.js";
import { DependencyAnalyzer } from "./dependencyAnalyzer.js";

export class CodeAgent {

 constructor() {


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");

this.planner = new Planner();

this.projectIndexer = new ProjectIndexer(projectRoot);

this.dependencyAnalyzer = new DependencyAnalyzer();

this.taskGraph = new TaskGraph();

this.memory = new MemoryManager();

this.files = new FileAgent(projectRoot);

this.tools = new ToolManager();

this.scanner = new ProjectScanner(projectRoot);


this.intent = new IntentParser();

this.conversation = new ConversationManager();

this.context = new ContextBuilder();

this.retriever = new MemoryRetriever();

this.summarizer = new ConversationSummarizer();

this.filePlanner = new FilePlanner();

this.contextBuilder = new ContextBuilder();

this.patchPlanner = new PatchPlanner();

this.diffEngine = new DiffEngine();

this.backupManager = new BackupManager();


console.log(
    "Scanner Root:",
    this.scanner.root
);


console.log("Code Agent Ready");

}

    async run(task) {

    console.log("Task:", task);

    // Planner se steps lo
    const plan = this.planner.create(task);

    // Task Graph banao
    const graph = this.taskGraph.build(plan);

    // Graph execute karo
  while (true) {

const step = this.taskGraph.next(graph);

if (!step) break;


step.startedAt = Date.now();


const result = await this.execute(step);


// result ko step me save karo

step.result = result;


this.taskGraph.complete(step);


}

    return graph;
}

    async execute(step) {

    console.log("Executing:", step);

    switch (step.type) {

        case "analysis":

            console.log(step.text);

            return {
                success: true,
                type: "analysis"
            };

        case "scan":

            return this.scanProject();

        case "memory":

    if (step.action === "load") {

        return this.memory.load();

    }

    if (step.action === "save") {

        this.memory.add({

            task: "Project Updated"

        });

        return {

            success: true

        };

    }

    break;

        case "code":

            console.log("Generating code...");

            return this.generate(step.task);

        case "file":


    if (step.action === "create") {

    const generated = this.generate(step.task);

    const plan = this.filePlanner.plan(generated);

    console.log("File Plan");

    console.table(plan);

   return this.executeFilePlan(plan);

}

    return this.files.execute(step);

        case "tool":

            return this.tools.execute(step);

        case "verify":

            console.log("Verifying project...");

            return this.analyzeProject();

        default:

            console.log(
                "Unknown step:",
                step.type
            );

            return {
                success: false,
                step
            };

    }

    const context = this.buildProjectContext();

console.log(
    "Project Files:",
    context.project.totalFiles
);

console.log(
    "Dependencies:",
    Object.keys(context.dependencies).length
);

}

    generate(task) {

        const text = task.toLowerCase();

        if (text.includes("website")) {
            return this.createWebsite(task);
        }

        if (text.includes("login")) {
            return this.createLoginPage();
        }

        if (text.includes("portfolio")) {
            return this.createPortfolio();
        }

        if (text.includes("dashboard")) {
            return this.createDashboard();
        }

        if (text.includes("chat")) {
            return this.createChatApp();
        }

        return {};
    }

    createFiles(files){


    const results=[];


    for(const file in files){


        results.push(

            this.files.execute({

                action:"create",

                file,

                content:files[file]

            })

        );


    }


    return results;


}

 scanProject() {

    const files = this.scanner.scan();

    const summary = this.scanner.summarize(files);

    const project = this.scanner.detectProject(files);

    console.log("Project Summary");

    console.table(summary);

    console.table(project);

    console.table(files);

    return {

        files,
        summary,
        project

    };

}


findFile(keyword) {

    const files = this.scanner.scan();

    const results = this.scanner.findFile(files, keyword);

    console.log("Search:", keyword);

    console.table(results);

    return results;

}

readFile(filePath) {

    const content = this.files.read(filePath);

    if (!content) {

        return null;

    }

    console.log("Reading:", filePath);

    console.log(content);

    return content;

}

analyzeFile(filePath) {

    const report = this.files.analyze(filePath);

    if (!report) {

        return null;

    }

    console.log("Analysis:", filePath);

    console.table(report);

    return report;

}


analyzeProject() {

    const files = this.scanner.scan();

    const jsFiles = files.filter(file =>
        file.endsWith(".js")
    );

    const report = [];

    for (const file of jsFiles) {

        const analysis = this.files.analyze(file);

        report.push({

            file,

            ...analysis

        });

    }

    console.log("Project Analysis");

    console.table(report);

    return report;

}

detectIntent(prompt) {

    const result = this.intent.parse(prompt);

    console.log("Detected Intent");

    console.table(result);

    return result;

}

   createWebsite(task = "") {

    const site = this.analyzePrompt(task);

        return {

            "index.html": `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>AI Website</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<header>
<h1>${site.title}</h1>
</header>

<main>

<p>${site.subtitle}</p>

${this.generateSections(task)}

</main>

</body>
</html>`,"style.css": this.generateCSS()

        };

    }

    createLoginPage() {

        return {

            "login.html": `<!DOCTYPE html>
<html>
<head>
<title>Login</title>
</head>
<body>

<h1>Login Page</h1>

<form>

<input placeholder="Email">

<input type="password" placeholder="Password">

<button>Login</button>

</form>

</body>
</html>`

        };

    }

    createPortfolio() {

        return {

            "portfolio.html": `<!DOCTYPE html>
<html>
<head>
<title>Portfolio</title>
</head>
<body>

<h1>My Portfolio</h1>

</body>
</html>`

        };

    }

    createDashboard() {

        return {

            "dashboard.html": `<!DOCTYPE html>
<html>
<head>
<title>Dashboard</title>
</head>
<body>

<h1>Dashboard</h1>

</body>
</html>`

        };

    }

    createChatApp() {

        return {

            "chat.html": `<!DOCTYPE html>
<html>
<head>
<title>Chat App</title>
</head>
<body>

<h1>Chat Application</h1>

</body>
</html>`

        };

    }

    generateSections(prompt = "") {

    const lower = prompt.toLowerCase();
    const site = this.analyzePrompt(prompt);

    const wantsPortfolio =
        lower.includes("portfolio") ||
        lower.includes("developer");

    const wantsBusiness =
        lower.includes("business") ||
        lower.includes("company");

    let html = "";

const featureCards = site.features.map(feature => `

<div class="feature-card">

    <h3>${feature}</h3>

    <p>

        Professional ${feature.toLowerCase()} solution generated automatically.

    </p>

</div>

`).join("");

   html += `

<section class="features">

    <div class="container">

        <h2>Features</h2>

        <p class="section-subtitle">

            ${site.subtitle}

        </p>

        <div class="feature-grid">

            ${featureCards}

        </div>

    </div>

</section>

`;

    if (wantsPortfolio) {

        html += `

<section class="about">

<div class="container">

<h2>About Me</h2>

<p>

I am a passionate web developer who enjoys creating modern,
responsive and user-friendly web applications.

</p>

</div>

</section>

`;

    } else if (wantsBusiness) {

        html += `

<section class="about">

<div class="container">

<h2>About Our Company</h2>

<p>

We deliver high quality digital solutions focused on
performance, innovation and customer satisfaction.

</p>

</div>

</section>

`;

    } else {

        html += `

<section class="about">

<div class="container">

<h2>About</h2>

<p>

${site.subtitle}

Built automatically by CodeAgent using AI-powered website generation.

</p>

</div>

</section>

`;

    }

    html += `

<section class="services">

<div class="container">

<h2>

${site.type.charAt(0).toUpperCase() + site.type.slice(1)} Services

</h2>

<div class="service-grid">

<div class="service-card">

<h3>Web Design</h3>

<p>

Beautiful responsive layouts.

</p>

</div>

<div class="service-card">

<h3>Development</h3>

<p>

Modern HTML CSS JavaScript solutions.

</p>

</div>

<div class="service-card">

<h3>Optimization</h3>

<p>

Fast loading and SEO friendly websites.

</p>

</div>

</div>

</div>

</section>

`;

    html += `

<section class="contact">

<div class="container">

<h2>

Contact ${site.title}

</h2>

<form class="contact-form">

<input
type="text"
placeholder="Your Name"
required
>

<input
type="email"
placeholder="Email"
required
>

<textarea
placeholder="Message"
rows="5"
required
></textarea>

<button type="submit">

Send Message

</button>

</form>

</div>

</section>

`;

    html += `

<footer>

<div class="container">

<p>

© ${new Date().getFullYear()} ${site.title}

</p>

</div>

</footer>

`;

    return html;

}


generateCSS() {

    return `

*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

html{
    scroll-behavior:smooth;
}

body{

    font-family:Arial,Helvetica,sans-serif;
    background:#0f172a;
    color:#ffffff;
    line-height:1.7;

}

.container{

    width:min(1200px,92%);
    margin:auto;

}

header{

    background:#111827;
    padding:25px;
    text-align:center;
    border-bottom:1px solid rgba(255,255,255,.08);

}

header h1{

    font-size:2.4rem;
    color:#60a5fa;

}

main{

    padding:60px 0;

}

section{

    margin:80px 0;

}

section h2{

    text-align:center;
    margin-bottom:40px;
    font-size:2rem;
    color:#ffffff;

}

.features,
.services,
.about,
.contact{

    width:100%;

}

.feature-grid,
.service-grid{

    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
    gap:25px;

}

.feature-card,
.service-card{

    background:#1e293b;
    padding:30px;
    border-radius:14px;
    transition:.3s;
    border:1px solid rgba(255,255,255,.06);

}

.feature-card:hover,
.service-card:hover{

    transform:translateY(-8px);

}

.feature-card h3,
.service-card h3{

    margin-bottom:15px;
    color:#60a5fa;

}

.about p{

    max-width:800px;
    margin:auto;
    text-align:center;
    color:#d1d5db;

}
    .contact-form{

    max-width:700px;
    margin:auto;
    display:flex;
    flex-direction:column;
    gap:20px;

}

.contact-form input,
.contact-form textarea{

    width:100%;
    padding:16px;
    border:none;
    border-radius:10px;
    background:#111827;
    color:#ffffff;
    font-size:16px;
    outline:none;

}

.contact-form input::placeholder,
.contact-form textarea::placeholder{

    color:#9ca3af;

}

.contact-form button{

    padding:16px;
    border:none;
    border-radius:10px;
    background:#3b82f6;
    color:#ffffff;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
    transition:.3s;

}

.contact-form button:hover{

    background:#2563eb;

}

footer{

    margin-top:80px;
    padding:30px;
    text-align:center;
    background:#111827;
    border-top:1px solid rgba(255,255,255,.08);

}

footer p{

    color:#9ca3af;

}

@media (max-width:768px){

    header h1{

        font-size:2rem;

    }

    section{

        margin:60px 0;

    }

    section h2{

        font-size:1.7rem;

    }

    .feature-grid,
    .service-grid{

        grid-template-columns:1fr;

    }

    .feature-card,
    .service-card{

        padding:24px;

    }

}

@media (max-width:480px){

    body{

        font-size:15px;

    }

    header{

        padding:18px;

    }

    header h1{

        font-size:1.7rem;

    }

    main{

        padding:40px 0;

    }

    .contact-form input,
    .contact-form textarea,
    .contact-form button{

        padding:14px;

    }

}

`;
}


analyzePrompt(prompt = "") {

    const text = prompt.toLowerCase();

    const data = {

        type: "website",

        title: "AI Generated Website",

        subtitle: "Professional website generated by CodeAgent.",

        features: [
            "Fast",
            "Responsive",
            "Modern",
            "Secure"
        ]

    };

    if (text.includes("portfolio")) {

        data.type = "portfolio";

        data.title = "Developer Portfolio";

        data.subtitle =
            "Professional portfolio generated by AI.";

    }

    else if (
        text.includes("restaurant") ||
        text.includes("food")
    ) {

        data.type = "restaurant";

        data.title = "Restaurant Website";

        data.subtitle =
            "Fresh food with an amazing dining experience.";

    }

    else if (
        text.includes("school") ||
        text.includes("college")
    ) {

        data.type = "education";

        data.title = "School Website";

        data.subtitle =
            "Learning for a brighter future.";

    }

    else if (
        text.includes("gaming") ||
        text.includes("game")
    ) {

        data.type = "gaming";

        data.title = "Gaming Community";

        data.subtitle =
            "Play, compete and connect.";

    }

    else if (
        text.includes("business") ||
        text.includes("company")
    ) {

        data.type = "business";

        data.title = "Business Website";

        data.subtitle =
            "Helping your business grow online.";

    }

    return data;

}

startConversation(title = "New Chat") {

    return this.conversation.newChat(title);

}

openConversation(id) {

    return this.conversation.open(id);

}
rememberUserMessage(text) {

    this.conversation.addMessage(

        "user",

        text

    );

}
rememberAssistantMessage(text) {

    this.conversation.addMessage(

        "assistant",

        text

    );

}

buildContext(prompt = "") {

    const project =

        this.scanProject().project;

    const messages =

        this.conversation.getMessages();

    const summary =

        this.createSummary();

    const memories =

        this.retrieveRelevantMemory(prompt);

    return this.context.buildComplete(

        project,

        summary,

        memories,

        messages

    );

}

retrieveRelevantMemory(prompt) {

    const messages =

        this.conversation.getMessages();

    return this.retriever.search(

        messages,

        prompt

    );

}
createSummary() {

    const messages =

        this.conversation.getMessages();

    return this.summarizer.summarize(

        messages

    );

}


buildProjectContext() {

    const project = this.projectIndexer.index();

    const dependencies =
        this.dependencyAnalyzer.analyze(project.js);

    return {
        project,
        dependencies
    };

}


executeFilePlan(plan){


const results = [];


for(const action of plan){


    results.push(

        this.files.execute(action)

    );


}


return results;


}

}

