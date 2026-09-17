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

import { VoiceInput } from "./voice-input.js";



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

    // Voice input (composer microphone)
    this.voiceInput = new VoiceInput();

    // Ab VoiceUI ko config do
    this.voiceUI = new VoiceUI(
        this.voice.config
    );

    this.imageGenerator = new ImageGenerator();

    this.state = {

        ready: false,

        sending: false

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


            // Sync sidebar active state with restored/created chat

if (this.chat.state.currentChatId) {

    this.sidebar.setActiveChat(
        this.chat.state.currentChatId
    );

}


            this.codeblock.initialize();


            this.voice.initialize();

            // Voice input uses the saved TTS language when present,
            // falling back to navigator.language inside VoiceInput.
            this.voiceInput.initialize({
                language: this.voice?.settings?.language
            });

            this.ui.setVoiceInputSupported(
                this.voiceInput.supported
            );

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


        if (this.imageGenerator.state.loading) {

            return;

        }


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

        if (!image || typeof image.url !== "string" || !/^https?:\/\//i.test(image.url)) {

            return;

        }


        const content =

            '<img src="' +

            image.url.replace(/"/g, "&quot;") +

            '" alt="Generated image">';


        const persisted =

            this.chat &&

            this.chat.addMessage(

                "assistant",

                content

            );


        if (!persisted) {

            this.ui.showGeneratedImage(image);

        }

    }

);


Events.on(

    "image:start",

    ()=>{

        this.ui.showTyping(true);

        this.toggleImageButton(false);

    }

);


Events.on(

    "image:end",

    ()=>{

        this.ui.showTyping(false);

        this.toggleImageButton(true);

    }

);


Events.on(

    "image:error",

    error=>{

        this.ui.showTyping(false);

        this.ui.showError(

            (error && (error.message || error)) ||

            "Image generation failed"

        );

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
          Select Chat
        */


        Events.on(

            "chat:selected",

            payload => {


                // Sidebar emits a string chat id. Chat.openChat()
                // also re-emits chat:selected with a chat OBJECT for
                // the chat it just opened — that chat is already
                // current by definition, so only the string form
                // needs to be handled here (the sidebar consumes the
                // object form for highlight purposes).
                if (typeof payload !== "string") {

                    return;

                }


                this.chat.openChat(

                    payload

                );


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
          Clear Chat
        */


        Events.on(

            "chat:clear",

            ()=>{

                if (this.chat) {

                    this.chat.clearChat();

                }

            }

        );





        /*
          Send Message To AI
        */


        Events.on(

            "ai:request",

            async data => {


                let assistant = null;


                const chatId = data.chatId;


                let finalized = false;
                let aborted = false;
                try{


                    this.ui.hideError();


                    const history = this.chat.getMessages(chatId)
                        .slice(0, -1)
                        .slice(-10)
                        .map(msg => ({
                            role: msg.role,
                            content: msg.content
                        }));


                    assistant =

                    this.chat.createAssistantMessage(chatId);

                    if (assistant) {

                        this.chat.startStreaming(assistant.id);

                    }





                    // ===============================
                    // Exactly-once finalizer
                    // ===============================
                    // Render Markdown only once, when the stream
                    // completes. Deltas never touch history and never
                    // render; the final text is finalized exactly once
                    // into the SAME assistant bubble.

                    const finalizeChat = (fullText) => {

                        if (finalized) {

                            return;

                        }


                        finalized = true;


                        const html =

                            this.markdown.render(fullText);


                        this.chat.updateMessage(
                            assistant.id,
                            html,
                            chatId
                        );


                        this.codeblock.refresh();


                        // ===============================
                        // Remove HTML tags before speaking
                        // ===============================

                        const temp =

                            document.createElement("div");

                        temp.innerHTML = fullText;

                        const speechText =

                            temp.textContent ||
                            temp.innerText ||
                            "";


                        console.log(
                            "FINAL SPEECH TEXT:",
                            speechText
                        );


                        console.log(
                            "VOICE DETECT:",
                            this.voice.detector.detect(speechText)
                        );


                        // Only speak the reply when the sound setting
                        // is enabled. Spoken exactly once, after the
                        // complete response arrives.
                        if (
                            speechText &&
                            this.settings &&
                            this.settings.get("sound")
                        ) {

                            this.voice.speak(speechText);

                        }


                        this.chat.endStreaming(
                            assistant.id
                        );

                    };


                    const finalizeAbort = () => {

                        if (finalized || aborted) {

                            return;

                        }


                        aborted = true;

                        finalized = true;


                        if (assistant) {

                            this.chat.endStreaming(
                                assistant.id
                            );

                            // Roll back only an EMPTY bubble so any
                            // partial content the provider already
                            // delivered is preserved.
                            this.chat.rollbackEmptyMessage(
                                chatId,
                                assistant.id
                            );

                        }

                    };


                    await this.api.streamMessage(
                        data.message,
                        history,
                        {
                            onDelta: (delta, fullText) => {

                                // Race guard: only the chat that issued
                                // the request may receive partials. A
                                // stale late delta must never touch a
                                // newly selected chat.
                                if (
                                    assistant &&
                                    this.chat.getCurrentChat() &&
                                    this.chat.getCurrentChat().id === chatId
                                ) {

                                    this.chat.streamUpdate(
                                        assistant.id,
                                        fullText
                                    );

                                }

                            },

                            onDone: fullText => {

                                finalizeChat(fullText);

                            },

                            onError: error => {

                                // Exactly-once error finalizer. The API
                                // calls onError and then EITHER rejects
                                // (HTTP error, so the catch below would
                                // otherwise re-fire) OR resolves (stream
                                // "error" event, so the post-await abort
                                // check would otherwise re-fire). Mark
                                // finalized HERE so every downstream path
                                // (catch / post-await abort) sees it
                                // already ran — no doubled cleanup, no
                                // doubled error surface, no doubled
                                // history write.
                                if (finalized) {

                                    return;

                                }


                                finalized = true;

                                // The stream failed. Hide typing, roll
                                // back only if the bubble is empty
                                // (partials survive), then surface the
                                // sanitized error.
                                if (assistant) {

                                    this.chat.endStreaming(
                                        assistant.id
                                    );


                                    this.chat.rollbackEmptyMessage(
                                        chatId,
                                        assistant.id
                                    );

                                }


                                this.chat.handleError(error);

                            }

                        }
                    );


                    // A silent abort (user cancelled / signal) resolves
                    // without firing onDone or onError. Finalize quietly,
                    // preserving any partial content.
                    if (!finalized) {

                        finalizeAbort();

                    }


                }

catch(error){


                    // onError already finalized exactly-once for both
                    // failure shapes. The streamMessage contract: onError
                    // fires first, then EITHER the awaiting frame rejects
                    // here (HTTP error) OR the stream resolves with the
                    // partial (stream "error" event, handled by the
                    // post-await abort check). Both run after onError, so
                    // finalized is already true by the time we arrive.
                    // Bail out wholesale — no doubled typing cleanup, no
                    // doubled rollback, no doubled error surface, no
                    // doubled history write.
                    if (finalized) {

                        return;

                    }


                    if (assistant) {


                        // Hide the typing indicator and finalize the
                        // streaming session before rolling back, so
                        // the error path never leaves it stuck on.
                        this.chat.endStreaming(
                            assistant.id
                        );


                        this.chat.rollbackEmptyMessage(
                            chatId,
                            assistant.id
                        );

                    }


                    this.chat.handleError(

                        error

                    );


                }


                finally {

                    this.releaseSendLock();

                }



            }

        );

        
        /*
           Voice Input
        */


        Events.on(

            "voice-input:toggle",

            ()=>{

                if (!this.voiceInput) {

                    return;

                }

                if (this.voiceInput.isListening) {

                    this.voiceInput.stop();

                } else {

                    this.voiceInput.start();

                }

            }

        );


        Events.on(

            "voice-input:start",

            ()=>{

                this.ui.setVoiceInputListening(true);

            }

        );


        Events.on(

            "voice-input:end",

            ()=>{

                this.ui.setVoiceInputListening(false);

            }

        );


        Events.on(

            "voice-input:error",

            message=>{

                this.ui.setVoiceInputListening(false);

                if (this.ui.showError) {

                    this.ui.showError(message);

                }

            }

        );


        Events.on(

            "voice-input:text",

            text=>{

                // Transcript goes into the composer only. The user
                // sends it through the normal send flow.
                this.ui.insertVoiceText(text);

            }

        );





        /*
           Chat Send
        */

Events.on(

    "chat:send",

    text=>{


        // The guard is scoped per chat: an identical message sent
        // from a DIFFERENT chat must never be blocked.
        const chatId = this.chat && this.chat.state
            ? this.chat.state.currentChatId
            : null;


        if (this.state.sending) {

            // An AI request is already in flight. Do not start a
            // second send, and do not swallow the user's text.
            return false;

        }


        if (this._lastSendText === text &&

            this._lastSendChatId === chatId &&

            this._lastSendAt !== null &&

            Date.now() - this._lastSendAt < 1000) {

            // Intentional duplicate-submit race suppression. The
            // composer is left untouched so no input is lost.
            return false;

        }


        console.log(

            "APP RECEIVED:",

            text

        );


        this._lastSendText = text;

        this._lastSendChatId = chatId;

        this._lastSendAt = Date.now();

        this.state.sending = true;

        this.ui.setSending(true);


        const result = this.chat.sendMessage(

            text

        );


        if (result && typeof result.then === "function") {

            result.then(msg => {

                // No AI request was started (e.g. no active chat),
                // so the send lock must not stay held.
                if (!msg) {

                    this.releaseSendLock();

                }

            }).catch(() => {

                this.releaseSendLock();

            });

        }

        else if (!result) {

            this.releaseSendLock();

        }


        return true;


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


        Events.on(

            "voice:settings",

            ()=>{

                if (this.voiceUI) {

                    this.voiceUI.show();

                }

            }

        );


        /*
           Typing / Loading / Error Feedback
        */


        Events.on(

            "ui:typing",

            value=>{

                this.ui.showTyping(value);

            }

        );


        Events.on(

            "api:loading",

            value=>{

                this.ui.showTyping(value);

            }

        );


        Events.on(

            "api:error",

            ()=>{

                this.ui.showTyping(false);

            }

        );


        Events.on(

            "api:cancelled",

            ()=>{

                this.ui.showTyping(false);

                this.releaseSendLock();

            }

        );


        Events.on(

            "chat:error",

            error=>{

                this.ui.showTyping(false);

                this.ui.showError(

                    (error && (error.message || error)) ||

                    "Something went wrong"

                );

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
       SEND LOCK
    ======================================================= */


    releaseSendLock(){

        this.state.sending = false;

        if (this.ui) {

            this.ui.setSending(false);

        }

    }


    /* =======================================================
       IMAGE BUTTON LOCK
       Prevents duplicate image generations while one is active.
    ======================================================= */


    toggleImageButton(active){

        if (this.ui && this.ui.elements && this.ui.elements.imageButton) {

            this.ui.elements.imageButton.disabled = !active;

        }

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

        if (this.voiceInput) {

            this.voiceInput.destroy();

        }


        this.codeblock.destroy();



        this.state.ready = false;



        console.log(

            "App Destroyed"

        );


    }

    


}