/* ===========================================================
   AI CHAT
   File : ui.js
   Description : User Interface Manager
=========================================================== */


import { Markdown } from "./markdown.js";
import Events from "./events.js";



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

        ()=>{


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


        }

    );


}

        if(this.elements.sendButton){


            this.elements.sendButton.addEventListener(

                "click",

                ()=>{


                    this.sendInput();


                }

            );


        }





        if(this.elements.input){


            this.elements.input.addEventListener(

                "keydown",

                event=>{


                    if(

                        event.key === "Enter" &&

                        !event.shiftKey

                    ){


                        event.preventDefault();


                        this.sendInput();


                    }


                }

            );


        }



        /* =======================================================
    MENU BUTTON (TOGGLE SIDEBAR)
======================================================= */


        if(this.elements.menuButton){


            this.elements.menuButton.addEventListener(

                "click",

                ()=>{

                    Events.emit("menu:toggle");

                }

            );


        }



        /* =======================================================
    THEME TOGGLE
======================================================= */


        if(this.elements.themeToggle){


            this.elements.themeToggle.addEventListener(

                "click",

                ()=>{

                    Events.emit("ui:theme-toggle");

                }

            );


        }



        /* =======================================================
    VOICE TOGGLES
======================================================= */


        if(this.elements.voiceToggle){


            this.elements.voiceToggle.addEventListener(

                "click",

                ()=>{

                    Events.emit("voice:toggle");

                }

            );


        }


        if(this.elements.voiceInputBtn){


            this.elements.voiceInputBtn.addEventListener(

                "click",

                ()=>{

                    Events.emit("voice:toggle");

                }

            );


        }



        /* =======================================================
    SETTINGS MODAL
======================================================= */


        if(this.elements.settingsButton){


            this.elements.settingsButton.addEventListener(

                "click",

                ()=>{

                    Events.emit("settings:open");

                }

            );


        }


        if(this.elements.closeSettings){


            this.elements.closeSettings.addEventListener(

                "click",

                ()=>{

                    Events.emit("settings:close");

                }

            );


        }


        if(this.elements.settingsModal){


            this.elements.settingsModal.addEventListener(

                "click",

                event=>{

                    if(event.target === this.elements.settingsModal){

                        Events.emit("settings:close");

                    }

                }

            );


        }


        if(this.elements.themeSelect){


            this.elements.themeSelect.addEventListener(

                "change",

                event=>{

                    Events.emit(

                        "settings:theme-change",

                        event.target.value

                    );

                }

            );


        }


        if(this.elements.voiceSelect){


            this.elements.voiceSelect.addEventListener(

                "change",

                event=>{

                    Events.emit(

                        "settings:voice-change",

                        event.target.value

                    );

                }

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



        this.elements.input.value = "";



    Events.emit(
    "chat:send",
    text
);

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

        text

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



        content.innerHTML =

            this.markdown.render(

                text

            );



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



        this.elements.typing.style.display =

            value ? "block" : "none";


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



        this.elements.error.style.display =

            "block";


    }

    hideError(){


        if(!this.elements.error){


            return;


        }



        this.elements.error.textContent = "";



        this.elements.error.style.display =

            "none";


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