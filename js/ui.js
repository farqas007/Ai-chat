/* ===========================================================
   AI CHAT
   File : ui.js
   Description : User Interface Manager
=========================================================== */


import { Markdown } from "./markdown.js";
import Events from "./events.js";
import { mergeTranscript } from "./voice-input.js";



/* ===========================================================
   UI MANAGER
=========================================================== */


export class UI {


    constructor(){


        this.markdown = new Markdown();


        this.elements = {


chatContainer:
document.querySelector(
    "#chatContainer"
),


messages:
document.querySelector(
    "#messages"
),


input:

    document.querySelector(
        "#messageInput"
    ),

                imageButton: document.querySelector(
    "#imageBtn"
),


            sendButton:

                document.querySelector(

                    "#sendBtn"

                ),


            typing:

    document.querySelector(
        "#typingIndicator"
    ),


            error:

                document.querySelector(

                    "#error"

                ),


            menuButton:

                document.querySelector(

                    "#menuBtn"

                ),


            sidebarOverlay:

                document.querySelector(

                    "#sidebarOverlay"

                ),


            themeToggle:

                document.querySelector(

                    "#themeToggle"

                ),


            voiceToggle:

                document.querySelector(

                    "#voiceToggle"

                ),


            voiceInputBtn:

                document.querySelector(

                    "#voiceInputBtn"

                ),


            settingsButton:

                document.querySelector(

                    "#settingsBtn"

                ),


            settingsModal:

                document.querySelector(

                    "#settingsModal"

                ),


            closeSettings:

                document.querySelector(

                    "#closeSettings"

                ),


            themeSelect:

                document.querySelector(

                    "#themeSelect"

                ),


            voiceSelect:

                document.querySelector(

                    "#voiceSelect"

                ),


            exportChatBtn:

                document.querySelector(

                    "#exportChatBtn"

                ),


            importChatBtn:

                document.querySelector(

                    "#importChatBtn"

                ),


            chatImportFile:

                document.querySelector(

                    "#chatImportFile"

                )


        };



        this.messages = [];



        console.log(

            "UI Created"

        );


    }





    /* =======================================================
       INITIALIZE
    ======================================================= */


    initialize(){


        this.bindEvents();


        console.log(

            "UI Initialized"

        );


    }





    /* =======================================================
       EVENTS
    ======================================================= */


    bindEvents(){


        /* =======================================================
   IMAGE GENERATION BUTTON
======================================================= */


if(this.elements.imageButton){


    this.elements.imageButton.addEventListener(

        "click",

        (this._imageBtnClick = ()=>{


            const prompt = window.prompt(

                "Describe the image you want to create:"

            );



            if(!prompt){

                return;

            }



            Events.emit(

                "image:generate",

                prompt

            );


        })

    );


}

        if(this.elements.sendButton){


            this.elements.sendButton.addEventListener(

                "click",

                (this._sendBtnClick = ()=>{


                    this.sendInput();


                })

            );


        }





        if(this.elements.input){


            this.elements.input.addEventListener(

                "keydown",

                (this._inputKeydown = event=>{


                    if(

                        event.key === "Enter" &&

                        !event.shiftKey

                    ){


                        event.preventDefault();


                        this.sendInput();


                    }


                })

            );


        }



        /* =======================================================
    MENU BUTTON (TOGGLE SIDEBAR)
======================================================= */


        if(this.elements.menuButton){


            this.elements.menuButton.addEventListener(

                "click",

                (this._menuBtnClick = ()=>{

                    Events.emit("menu:toggle");

                })

            );


        }


        /* Prevent the mobile backdrop from trapping the app: a
           tap on the dimmed area closes the sidebar drawer. */
        if(this.elements.sidebarOverlay){


            this.elements.sidebarOverlay.addEventListener(

                "click",

                (this._overlayClick = ()=>{

                    Events.emit("menu:toggle");

                })

            );


        }



        /* =======================================================
    THEME TOGGLE
======================================================= */


        if(this.elements.themeToggle){


            this.elements.themeToggle.addEventListener(

                "click",

                (this._themeToggleClick = ()=>{

                    Events.emit("ui:theme-toggle");

                })

            );


        }



        /* =======================================================
    VOICE TOGGLES
======================================================= */


        if(this.elements.voiceToggle){


            this.elements.voiceToggle.addEventListener(

                "click",

                (this._voiceToggleClick = ()=>{

                    Events.emit("voice:toggle");

                })

            );


        }


        if(this.elements.voiceInputBtn){


            this.elements.voiceInputBtn.addEventListener(

                "click",

                (this._voiceInputBtnClick = ()=>{


                    Events.emit("voice-input:toggle");


                })

            );


        }



        /* =======================================================
    SETTINGS MODAL
======================================================= */


        if(this.elements.settingsButton){


            this.elements.settingsButton.addEventListener(

                "click",

                (this._settingsBtnClick = ()=>{

                    Events.emit("settings:open");

                })

            );


        }


        if(this.elements.closeSettings){


            this.elements.closeSettings.addEventListener(

                "click",

                (this._closeSettingsClick = ()=>{

                    Events.emit("settings:close");

                })

            );


        }


        if(this.elements.settingsModal){


            this.elements.settingsModal.addEventListener(

                "click",

                (this._settingsModalClick = event=>{

                    if(event.target === this.elements.settingsModal){

                        Events.emit("settings:close");

                    }

                })

            );


        }


        if(this.elements.themeSelect){


            this.elements.themeSelect.addEventListener(

                "change",

                (this._themeSelectChange = event=>{

                    Events.emit(

                        "settings:theme-change",

                        event.target.value

                    );

                })

            );


        }


        if(this.elements.voiceSelect){


            this.elements.voiceSelect.addEventListener(

                "change",

                (this._voiceSelectChange = event=>{

                    Events.emit(

                        "settings:voice-change",

                        event.target.value

                    );

                })

            );


        }


        /* =======================================================
    CHAT EXPORT / IMPORT
======================================================= */


        if(this.elements.exportChatBtn){


            this.elements.exportChatBtn.addEventListener(

                "click",

                (this._exportChatClick = ()=>{

                    Events.emit("chat:export");

                })

            );


        }


        if(this.elements.importChatBtn){


            this.elements.importChatBtn.addEventListener(

                "click",

                (this._importChatClick = ()=>{

                    if(this.elements.chatImportFile){

                        this.elements.chatImportFile.click();

                    }

                })

            );


        }


        if(this.elements.chatImportFile){


            this.elements.chatImportFile.addEventListener(

                "change",

                (this._chatImportChange = async event=>{

                    const file =

                        event.target.files &&

                        event.target.files[0];


                    if(!file){

                        return;

                    }


                    try{

                        const text = await file.text();

                        Events.emit("chat:import-file", text);

                    }

                    catch(error){

                        Events.emit(

                            "chat:import-error",

                            "Could not read the selected file"

                        );

                    }

                    finally{

                        this.elements.chatImportFile.value = "";

                    }


                })

            );


        }


    }

    
    /* =======================================================
       SEND INPUT
    ======================================================= */


    sendInput(){


        const text =

            this.elements.input.value.trim();



        if(!text){


            return;


        }



        if(
            this.elements.sendButton &&
            this.elements.sendButton.disabled
        ){


            // A send is already in flight. Keep the user's text in
            // the composer so it is never lost, and refocus it so
            // the user can see it is still there.
            if (this.elements.input && this.elements.input.focus) {

                this.elements.input.focus();

            }


            return;


        }



        // Emit first, clear only if the send was accepted. If the
        // message was suppressed (e.g. duplicate-submit race or a
        // send already in progress), the user's typed text must
        // stay in the composer.
        const accepted = Events.emit(

            "chat:send",

            text

        );

        if (accepted) {

            this.elements.input.value = "";

        }
        else if (this.elements.input && this.elements.input.focus) {

            // Suppressed: keep the input and refocus it so the text
            // is visible and can be sent once the send finishes.
            this.elements.input.focus();

        }

    }

    /* =======================================================
       VOICE INPUT SUPPORT
       Hides/disables the microphone when SpeechRecognition
       is not available in the browser.
    ======================================================= */


    setVoiceInputSupported(supported){

        const button =
            this.elements.voiceInputBtn;

        if(!button){

            return;

        }

        button.classList.toggle(
            "voice-unsupported",
            !supported
        );

        button.disabled = !supported;

        button.setAttribute(
            "aria-disabled",
            supported ? "false" : "true"
        );

        button.setAttribute(
            "aria-hidden",
            supported ? "false" : "true"
        );

    }


    /* =======================================================
       VOICE INPUT LISTENING STATE
    ======================================================= */


    setVoiceInputListening(listening){

        const button =
            this.elements.voiceInputBtn;

        if(!button){

            return;

        }

        button.classList.toggle(
            "listening",
            !!listening
        );

        button.setAttribute(
            "aria-pressed",
            listening ? "true" : "false"
        );

        if(listening){

            button.title = "Stop voice input";

            button.setAttribute(
                "aria-label",
                "Stop voice input"
            );

        } else {

            button.title = "Voice input";

            button.setAttribute(
                "aria-label",
                "Voice input"
            );

        }

    }


    /* =======================================================
       INSERT VOICE TEXT
       Places a transcript into the composer without touching
       HTML and without deleting existing typed text.
    ======================================================= */


    insertVoiceText(text){

        const input =
            this.elements.input;

        if(!input){

            return;

        }

        input.value =
            mergeTranscript(
                input.value,
                text
            );

        input.focus();

    }


    /* =======================================================
       SENDING STATE
    ======================================================= */


    setSending(isSending){


        if(!this.elements.sendButton){


            return;


        }



        this.elements.sendButton.disabled = !!isSending;


    }





    /* =======================================================
       RENDER CHAT
    ======================================================= */


    renderChat(messages=[]){


        this.clearMessages();


        if(!messages.length){

            this.showWelcome();

            return;

        }


        messages.forEach(

            message=>{


                this.appendMessage(

                    message

                );


            }

        );


    }





    /* =======================================================
       ADD MESSAGE
    ======================================================= */


    appendMessage(message){


        if(!this.elements.chatContainer){


            return;


        }


        const container =
            this.elements.messages ||
            this.elements.chatContainer;


        const welcome =
            container.querySelector(".welcome");

        if(welcome) welcome.remove();



        const wrapper =

            document.createElement(

                "div"

            );



       wrapper.className =
    `message ${message.role}-message`;



        wrapper.dataset.id =

            message.id || "";





        const content =

            document.createElement(

                "div"

            );



        content.className =

            "message-content";



        if(

            message.role === "assistant"

        ){


            content.innerHTML =

                this.markdown.render(

                    message.content

                );


        }

        else{


            content.textContent =

                message.content;


        }




        wrapper.appendChild(

            content

        );



        container.appendChild(

            wrapper

        );



        this.scrollBottom();



    }





    /* =======================================================
       UPDATE STREAM MESSAGE
    ======================================================= */


    updateStreamingMessage(

        id,

        text,

        renderMarkdown = true

    ){



        const element =

            document.querySelector(

                `[data-id="${id}"]`

            );



        if(!element){


            return;


        }



        const content =

            element.querySelector(

                ".message-content"

            );



        if (renderMarkdown) {



            // Final content: render Markdown exactly once, when the
            // stream completes. Code blocks are processed afterwards
            // by app.codeblock.refresh().


            content.innerHTML =

                this.markdown.render(

                    text

                );




        } else {



            // In-flight deltas: update the SAME bubble with raw text
            // only. Markdown is never re-rendered per chunk.


            content.textContent =

                text;




        }



        this.scrollBottom();



    }





    /* =======================================================
       REMOVE MESSAGE
    ======================================================= */


    removeMessage(id){


        const element =

            document.querySelector(

                `[data-id="${id}"]`

            );



        if(element){


            element.remove();


        }


    }





    /* =======================================================
       CLEAR
    ======================================================= */


    clearMessages(){


        const container =

            this.elements.messages ||

            this.elements.chatContainer;


        if(container){


            container.innerHTML = "";


        }


    }





    /* =======================================================
       EMPTY STATE
    ======================================================= */


    showEmptyState(){

        this.clearMessages();

        this.showWelcome();

    }


    showWelcome(){


        const container =

            this.elements.messages ||

            this.elements.chatContainer;


        if(!container) return;


        if(container.querySelector(".welcome")) return;


        const welcome = document.createElement("div");


        welcome.className = "welcome";


        welcome.innerHTML = `

            <h2>Hello</h2>

            <p>How can I help you today?</p>

        `;


        container.appendChild(welcome);


    }





    /* =======================================================
       TYPING
    ======================================================= */


    showTyping(value){


        if(!this.elements.typing){


            return;


        }



        this.elements.typing.classList.toggle(
            "hidden",
            !value
        );


    }





    /* =======================================================
       ERROR
    ======================================================= */


    showError(message){


        if(!this.elements.error){


            return;


        }



        this.elements.error.textContent =

            message;


        this.elements.error.classList.remove(
            "hidden"
        );


    }

    hideError(){


        if(!this.elements.error){


            return;


        }



        this.elements.error.textContent = "";


        this.elements.error.classList.add(
            "hidden"
        );


    }





    /* =======================================================
       SCROLL
    ======================================================= */


    scrollBottom(){


        if(this.elements.chatContainer){


            this.elements.chatContainer.scrollTop =

                this.elements.chatContainer.scrollHeight;


        }


    }





    /* =======================================================
       DESTROY
    ======================================================= */


    destroy(){

        const elPairs = [
            ["imageButton", "_imageBtnClick", "click"],
            ["sendButton", "_sendBtnClick", "click"],
            ["input", "_inputKeydown", "keydown"],
            ["menuButton", "_menuBtnClick", "click"],
            ["sidebarOverlay", "_overlayClick", "click"],
            ["themeToggle", "_themeToggleClick", "click"],
            ["voiceToggle", "_voiceToggleClick", "click"],
            ["voiceInputBtn", "_voiceInputBtnClick", "click"],
            ["settingsButton", "_settingsBtnClick", "click"],
            ["closeSettings", "_closeSettingsClick", "click"],
            ["settingsModal", "_settingsModalClick", "click"],
            ["themeSelect", "_themeSelectChange", "change"],
            ["voiceSelect", "_voiceSelectChange", "change"],
            ["exportChatBtn", "_exportChatClick", "click"],
            ["importChatBtn", "_importChatClick", "click"],
            ["chatImportFile", "_chatImportChange", "change"]
        ];

        for (const [elKey, refKey, evt] of elPairs) {
            const el = this.elements[elKey];
            const handler = this[refKey];
            if (el && handler) {
                el.removeEventListener(evt, handler);
                this[refKey] = null;
            }
        }

        this.messages = [];


        console.log(

            "UI Destroyed"

        );


    }



    /* =======================================================
   SHOW GENERATED IMAGE
======================================================= */
showGeneratedImage(image){


   const container =

    document.querySelector(

        "#chatContainer"

    );



    if(!container){

        return;

    }



    const wrapper = document.createElement(

        "div"

    );



    wrapper.className =

        "message assistant-message";



    const content = document.createElement(

        "div"

    );



    content.className =

        "message-content";



    const label = document.createElement(

        "p"

    );



    label.innerHTML =
        '<svg class="icon-btn" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';



    label.appendChild(

        document.createTextNode(

            " Generated Image"

        )

    );



    content.appendChild(label);



    const src =

        typeof image?.url === "string" ?

            image.url :

            "";



    if (src && /^https?:\/\//i.test(src)) {



        const img = document.createElement(

            "img"

        );



        img.src = src;



        img.setAttribute(

            "alt",

            typeof image?.prompt === "string" ?

                image.prompt :

                "Generated image"

        );



        img.className =

            "generated-image";



        img.setAttribute(

            "referrerpolicy",

            "no-referrer"

        );



        content.appendChild(img);



    }



    wrapper.appendChild(content);



    container.appendChild(

        wrapper

    );

}

}