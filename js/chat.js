/* ===========================================================
   AI CHAT
   File : chat.js
   Description : Chat Manager
=========================================================== */


import Events from "./events.js";

import { generateId } from "./utils.js";


/* ===========================================================
   CHAT MANAGER
=========================================================== */

export class Chat {


    constructor() {


        this.storage = null;

        this.ui = null;


        this.state = {

            chats: [],

            currentChatId: null,

            messages: []

        };


        console.log(

            "Chat Manager Created"

        );


    }



    /* =======================================================
       CONNECT MODULES
    ======================================================= */


    connect({

        storage,

        ui

    }) {


        this.storage = storage;

        this.ui = ui;


    }




    /* =======================================================
       INITIALIZE
    ======================================================= */


    initialize() {


        this.loadChats();


        this.restoreCurrentChat();


        console.log(

            "Chat Initialized"

        );


    }



    /* =======================================================
       LOAD CHATS
    ======================================================= */


    loadChats() {


        if (!this.storage) {

            return;

        }


        this.state.chats =

            this.storage.getChats();


    }



    /* =======================================================
       RESTORE CURRENT CHAT
    ======================================================= */


    restoreCurrentChat() {


        const current =

            this.storage.getCurrentChat();


        if (current) {


            this.openChat(

                current

            );


        }


    }


    /* =======================================================
   CREATE CHAT
======================================================= */

createChat(title = "New Chat") {


    const chat = {


        id: generateId("chat"),


        title,


        messages: [],


        createdAt: new Date().toISOString(),


        updatedAt: new Date().toISOString()


    };


    this.state.chats.push(

        chat

    );


    this.saveChats();


    this.openChat(

        chat.id

    );


    Events.emit(

        "chat:created",

        chat

    );


    return chat;


}


/* =======================================================
   OPEN CHAT
======================================================= */

openChat(chatId) {


    const chat = this.state.chats.find(

        item =>

            item.id === chatId

    );


    if (!chat) {

        return;

    }


    this.state.currentChatId = chat.id;


    this.state.messages =

        chat.messages;


    this.storage.setCurrentChat(

        chat.id

    );


    if (this.ui) {


        this.ui.renderChat(

            chat.messages

        );


    }


    Events.emit(

        "chat:selected",

        chat

    );


}


/* =======================================================
   DELETE CHAT
======================================================= */

deleteChat(chatId) {


    this.state.chats =

        this.state.chats.filter(

            chat =>

                chat.id !== chatId

        );


    this.saveChats();


    if (

        this.state.currentChatId === chatId

    ) {


        this.state.currentChatId = null;


        this.state.messages = [];


        if (this.ui) {


            this.ui.showEmptyState();


        }


    }


    Events.emit(

        "chat:deleted",

        chatId

    );


}


/* =======================================================
   RENAME CHAT
======================================================= */

renameChat(

    chatId,

    newTitle

) {


    const chat = this.state.chats.find(

        item =>

            item.id === chatId

    );


    if (!chat) {

        return;

    }


    chat.title = newTitle;


    chat.updatedAt =

        new Date().toISOString();


    this.saveChats();


    Events.emit(

        "chat:renamed",

        chat

    );


}

/* =======================================================
   SAVE CHATS
======================================================= */

saveChats() {


    if (!this.storage) {

        return;

    }


    this.storage.saveChats(

        this.state.chats

    );


}

/* =======================================================
   GET CURRENT CHAT
======================================================= */

getCurrentChat() {

    return this.state.chats.find(

        chat =>

            chat.id === this.state.currentChatId

    ) || null;

}


/* =======================================================
   GET MESSAGES
======================================================= */

getMessages() {

    const chat = this.getCurrentChat();


    if (!chat) {

        return [];

    }


    return chat.messages;

}


/* =======================================================
   ADD MESSAGE
======================================================= */

addMessage(

    role,

    content

) {


    const chat = this.getCurrentChat();


    if (!chat) {


        console.warn(

            "No active chat"

        );


        return null;

    }



    const message = {


        id: generateId("message"),


        role,


        content,


        createdAt: new Date().toISOString()


    };



    chat.messages.push(

        message

    );


    chat.updatedAt =

        new Date().toISOString();



    this.state.messages =

        chat.messages;



    this.saveChats();



    if (this.ui) {


        this.ui.appendMessage(

            message

        );


    }



    Events.emit(

        "message:added",

        message

    );



    return message;


}


/* =======================================================
   UPDATE MESSAGE
======================================================= */

updateMessage(

    messageId,

    content

) {


    const chat = this.getCurrentChat();


    if (!chat) {

        return;

    }



    const message = chat.messages.find(

        item =>

            item.id === messageId

    );



    if (!message) {

        return;

    }



    message.content = content;


    chat.updatedAt =

        new Date().toISOString();



    this.saveChats();



    if (this.ui) {


        this.ui.updateStreamingMessage(

            messageId,

            content

        );


    }



    Events.emit(

        "message:updated",

        message

    );


}


/* =======================================================
   DELETE MESSAGE
======================================================= */

deleteMessage(messageId) {


    const chat = this.getCurrentChat();


    if (!chat) {

        return;

    }



    chat.messages =

        chat.messages.filter(

            message =>

                message.id !== messageId

        );



    this.state.messages =

        chat.messages;



    this.saveChats();



    if (this.ui) {


        this.ui.removeMessage(

            messageId

        );


    }



    Events.emit(

        "message:deleted",

        messageId

    );


}


/* =======================================================
   CLEAR CURRENT CHAT
======================================================= */

clearChat() {


    const chat = this.getCurrentChat();


    if (!chat) {

        return;

    }



    chat.messages = [];


    this.state.messages = [];



    this.saveChats();



    if (this.ui) {


        this.ui.clearMessages();


    }



    Events.emit(

        "chat:cleared",

        chat.id

    );


}

/* =======================================================
   SEND USER MESSAGE
======================================================= */

async sendMessage(content) {

    if (!content || !content.trim()) {

        return;

    }


    const userMessage = this.addMessage(

        "user",

        content.trim()

    );


    if (!userMessage) {

        return;

    }


    this.updateChatTitle();

    console.log(
    "AI REQUEST:",
    content
);


    Events.emit(

        "ai:request",

        {

            message: content,

            chatId: this.state.currentChatId

        }

    );


    return userMessage;

}



/* =======================================================
   CREATE ASSISTANT MESSAGE
======================================================= */

createAssistantMessage() {


    const message = this.addMessage(

        "assistant",

        ""

    );


    Events.emit(

        "assistant:created",

        message

    );


    return message;


}



/* =======================================================
   START STREAM
======================================================= */

startStreaming(messageId) {


    Events.emit(

        "ui:typing",

        true

    );


    Events.emit(

        "stream:start",

        {

            messageId

        }

    );


}



/* =======================================================
   UPDATE STREAM RESPONSE
======================================================= */

streamUpdate(

    messageId,

    text

) {


    const chat = this.getCurrentChat();


    if (!chat) {

        return;

    }



    const message = chat.messages.find(

        item =>

            item.id === messageId

    );



    if (!message) {

        return;

    }



    message.content = text;



    if (this.ui) {


        this.ui.updateStreamingMessage(

            messageId,

            text

        );


    }


}



/* =======================================================
   END STREAM
======================================================= */

endStreaming(messageId) {


    Events.emit(

        "ui:typing",

        false

    );


    this.saveChats();


    Events.emit(

        "stream:end",

        {

            messageId

        }

    );


}



/* =======================================================
   REGENERATE RESPONSE
======================================================= */

regenerate(messageId) {


    const chat = this.getCurrentChat();


    if (!chat) {

        return;

    }



    const messageIndex = chat.messages.findIndex(

        message =>

            message.id === messageId

    );



    if (messageIndex === -1) {

        return;

    }



    const previousMessage =

        chat.messages[messageIndex - 1];



    if (!previousMessage) {

        return;

    }



    Events.emit(

        "ai:regenerate",

        {

            message: previousMessage.content,

            chatId: chat.id

        }

    );

}



/* =======================================================
   AUTO UPDATE TITLE
======================================================= */

updateChatTitle() {


    const chat = this.getCurrentChat();


    if (!chat) {

        return;

    }



    if (

        chat.title === "New Chat" &&

        chat.messages.length > 0

    ) {


        const firstMessage =

            chat.messages[0].content;



        chat.title =

            firstMessage.substring(

                0,

                30

            );


        this.saveChats();


        Events.emit(

            "chat:title-updated",

            chat

        );


    }


}

/* =======================================================
   HANDLE ERROR
======================================================= */

handleError(error) {

    console.error(

        "Chat Error:",

        error

    );


    Events.emit(

        "chat:error",

        error

    );


    if (this.ui) {

        this.ui.showError(

            error.message ||

            "Something went wrong"

        );

    }

}



/* =======================================================
   EXPORT CHAT
======================================================= */

exportChat(chatId = null) {


    const chat = chatId

        ? this.state.chats.find(

            item => item.id === chatId

        )

        : this.getCurrentChat();



    if (!chat) {

        return null;

    }



    return JSON.stringify(

        chat,

        null,

        4

    );


}



/* =======================================================
   IMPORT CHAT
======================================================= */

importChat(data) {


    try {


        const chat =

            typeof data === "string"

                ? JSON.parse(data)

                : data;



        if (!chat.id) {

            throw new Error(

                "Invalid chat data"

            );

        }



        this.state.chats.push(

            chat

        );


        this.saveChats();



        Events.emit(

            "chat:imported",

            chat

        );


        return chat;


    }

    catch(error) {


        this.handleError(

            error

        );


        return null;

    }


}



/* =======================================================
   SEARCH MESSAGES
======================================================= */

searchMessages(query) {


    if (!query) {

        return [];

    }



    const results = [];



    this.state.chats.forEach(

        chat => {


            chat.messages.forEach(

                message => {


                    if (

                        message.content

                        .toLowerCase()

                        .includes(

                            query.toLowerCase()

                        )

                    ) {


                        results.push({

                            chatId: chat.id,

                            chatTitle: chat.title,

                            message

                        });


                    }


                }

            );


        }

    );



    return results;


}



/* =======================================================
   GET CHAT STATISTICS
======================================================= */

getStatistics() {


    const chats =

        this.state.chats;



    let messages = 0;



    chats.forEach(

        chat => {


            messages +=

                chat.messages.length;


        }

    );



    return {


        totalChats:

            chats.length,


        totalMessages:

            messages,


        currentChat:

            this.state.currentChatId


    };


}



/* =======================================================
   RESET
======================================================= */

reset() {


    this.state = {


        chats: [],


        currentChatId: null,


        messages: []


    };


}



/* =======================================================
   DESTROY
======================================================= */

destroy() {


    this.reset();


    this.storage = null;

    this.ui = null;



    console.log(

        "Chat Manager Destroyed"

    );


}

}