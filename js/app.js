/* ===========================================================
   AI CHAT
   File : app.js
   Description : Application Controller
=========================================================== */


import Events from "./events.js";

import { ImageGenerator } from "./imageGenerator.js";

import { Storage } from "./storage.js";

import { Settings } from "./settings.js";

import { UI } from "./ui.js";

import { Chat } from "./chat.js";

import { Sidebar } from "./sidebar.js";

import { API } from "./api.js";

import { Markdown } from "./markdown.js";

import { CodeBlock } from "./codeblock.js";

import { Voice } from "./voice.js";

import { VoiceUI } from "./voiceUI.js";



/* ===========================================================
   APPLICATION
=========================================================== */


export class App {


constructor(){

    this.storage = new Storage();

    this.settings = new Settings();

    this.ui = new UI();

    this.chat = new Chat();

    this.sidebar = new Sidebar();

    this.api = new API();

    this.markdown = new Markdown();

    this.codeblock = new CodeBlock();

    // Voice pehle create karo
    this.voice = new Voice();

    // Ab VoiceUI ko config do
    this.voiceUI = new VoiceUI(
        this.voice.config
    );

    this.imageGenerator = new ImageGenerator();

    this.state = {

        ready: false

    };

    console.log(
        "App Created"
    );

}

    /* =======================================================
       INITIALIZE
    ======================================================= */


    async initialize(){

    try{

        this.voiceUI.initialize();

        console.log(
            "Starting AI Chat..."
        );



            /*
                Settings
            */


            this.settings.load();

            this.settings.applyTheme();



            /*
                UI
            */


            this.ui.initialize();





            /*
                Connect Chat
            */


            this.chat.connect({

                storage:this.storage,

                ui:this.ui

            });





            /*
                Connect Sidebar
            */


            this.sidebar.connect(

                this.storage

            );





            /*
                Initialize Modules
            */


            this.chat.initialize();


            this.sidebar.initialize();

            // Create first chat if none exists

if (!this.chat.getCurrentChat()) {

    this.chat.createChat(
        "New Chat"
    );

}


            this.codeblock.initialize();


            this.voice.initialize();

            console.log(
    "Image Generator Initialized"
);


            /*
                Events
            */


            this.registerEvents();




            this.state.ready = true;



            console.log(

                "AI Chat Ready"

            );


        }


        catch(error){


            console.error(

                "Initialization Error",

                error

            );


        }


    }





    /* =======================================================
       EVENTS
    ======================================================= */


    registerEvents(){



        /* =======================================================
   IMAGE GENERATION
======================================================= */

Events.on(

    

    "image:generate",

    async prompt => {


        try{


            const image =

                await this.imageGenerator.generate(

                    prompt

                );


            console.log(

                "Generated Image:",

                image

            );


        }


        catch(error){


            console.error(

                "Image Error",

                error

            );


        }


    }

);


Events.on(

    "image:created",

    image=>{

        this.ui.showGeneratedImage(image);

    }

);


Events.on(

    "voice:stop",

    ()=>{

        this.voice.stopSpeaking();

    }

);

Events.on(

    "voice:pause",

    ()=>{

        this.voice.player.pause();

    }

);

Events.on(

    "voice:resume",

    ()=>{

        this.voice.player.resume();

    }

);

Events.on(

    "voice:repeat",

    text=>{

        this.voice.speak(text);

    }

);


        /*
          New Chat
        */


        Events.on(

            "chat:new",

            ()=>{


                this.chat.createChat();


            }

        );





        /*
          Send Message To AI
        */


        Events.on(

            "ai:request",

            async data => {



                try{


                    const history = this.chat.getMessages()
                        .slice(0, -1)
                        .slice(-10)
                        .map(msg => ({
                            role: msg.role,
                            content: msg.content
                        }));


                    const assistant =

                    this.chat.createAssistantMessage();

                    this.chat.startStreaming(assistant.id);


                    const response = await this.api.sendWithRetry(
                        data.message,
                        history
                    );

const html = this.markdown.render(response);

this.chat.updateMessage(
    assistant.id,
    html
);

this.codeblock.refresh();


// ===============================
// Remove HTML tags before speaking
// ===============================

const temp = document.createElement("div");

temp.innerHTML = response;

const speechText = temp.textContent || temp.innerText || "";

console.log(
    "FINAL SPEECH TEXT:",
    speechText
);

console.log(
    "VOICE DETECT:",
    this.voice.detector.detect(speechText)
);

this.voice.speak(speechText);

this.chat.endStreaming(
    assistant.id
);


                }


                catch(error){



                    this.chat.handleError(

                        error

                    );


                }



            }

        );

        
        /*
           Voice Input
        */


        Events.on(

            "voice:text",

            text=>{


                Events.emit(

                    "chat:send",

                    text

                );


            }

        );





        /*
           Chat Send
        */

Events.on(

    "chat:send",

    text=>{


        console.log(

            "APP RECEIVED:",

            text

        );


        this.chat.sendMessage(

            text

        );


    }

);



        /*
           Delete Chat
        */


        Events.on(

            "chat:delete",

            id=>{


                this.chat.deleteChat(

                    id

                );


            }

        );





        /*
           Rename Chat
        */


        Events.on(

            "chat:rename",

            id=>{


                const name = prompt(

                    "New chat name"

                );



                if(name){


                    this.chat.renameChat(

                        id,

                        name

                    );


                }


            }

        );



        /*
           Sidebar Toggle
        */


        Events.on(

            "menu:toggle",

            ()=>{

                this.toggleSidebar();

            }

        );



        /*
           Theme Toggle
        */


        Events.on(

            "ui:theme-toggle",

            ()=>{

                this.settings.toggleTheme();

            }

        );



        Events.on(

            "settings:theme-change",

            theme=>{

                this.settings.set("theme", theme);

                this.settings.applyTheme();

            }

        );



        /*
           Settings Modal
        */


        Events.on(

            "settings:open",

            ()=>{

                const modal = this.ui.elements.settingsModal;

                const themeSelect = this.ui.elements.themeSelect;

                if (!modal) return;

                if (themeSelect) {

                    themeSelect.value = this.settings.get("theme");

                }

                this.populateVoiceOptions();

                modal.classList.remove("hidden");

                modal.style.display = "flex";

            }

        );



        Events.on(

            "settings:close",

            ()=>{

                const modal = this.ui.elements.settingsModal;

                if (!modal) return;

                modal.classList.add("hidden");

                modal.style.display = "none";

            }

        );



        Events.on(

            "settings:voice-change",

            value=>{

                if (this.voice) {

                    this.voice.setSettings({ language: value });

                }

            }

        );



        /*
           Voice UI
        */


        Events.on(

            "voice:toggle",

            ()=>{

                if (this.voiceUI) {

                    if (this.voiceUI.modal &&

                        this.voiceUI.modal.style.display === "flex") {

                        this.voiceUI.hide();

                    } else {

                        this.voiceUI.show();

                    }

                }

            }

        );


    }





    /* =======================================================
       TOGGLE SIDEBAR
    ======================================================= */


    toggleSidebar(){

        const sidebar = document.querySelector("#sidebar");

        if (!sidebar) return;

        sidebar.classList.toggle("active");

        const open = sidebar.classList.contains("active") ||

            window.innerWidth > 768;

        this.settings.setSidebar(open);

    }


    /* =======================================================
       POPULATE VOICE OPTIONS
    ======================================================= */


    populateVoiceOptions(){

        const select = this.ui.elements.voiceSelect;

        if (!select) return;

        const voices = this.voice?.voices || [];

        const langMap = {};

        voices.forEach(voice => {

            const lang = voice.lang;

            const name = voice.name;

            const label = `${name} (${lang})`;

            langMap[label] = label;

        });

        select.innerHTML = "";

        Object.values(langMap).forEach(label => {

            const option = document.createElement("option");

            option.value = label;

            option.textContent = label;

            select.appendChild(option);

        });

        const current = this.voice?.settings?.language;

        select.value = current || "";

    }


    /* =======================================================
       READY
    ======================================================= */


    isReady(){


        return this.state.ready;


    }





    /* =======================================================
       DESTROY
    ======================================================= */


    destroy(){


        this.chat.destroy();


        this.sidebar.destroy();


        this.voice.destroy();


        this.codeblock.destroy();



        this.state.ready = false;



        console.log(

            "App Destroyed"

        );


    }

    


}