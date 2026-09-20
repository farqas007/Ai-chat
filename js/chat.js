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


        if (this.storage) {


            this.storage.setCurrentChat(null);


        }


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

getMessages(chatId = null) {

    const chat = chatId

        ? this.state.chats.find(

            item => item.id === chatId

        ) || null

        : this.getCurrentChat();


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

    content,

    chatId = null

) {


    const chat = chatId

        ? this.state.chats.find(

            item => item.id === chatId

        ) || null

        : this.getCurrentChat();


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



    if (this.state.currentChatId === chat.id) {

        this.state.messages =

            chat.messages;

    }



    this.saveChats();



    if (this.ui &&

        this.state.currentChatId === chat.id) {


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

    content,

    chatId = null

) {


    const chat = chatId

        ? this.state.chats.find(

            item => item.id === chatId

        ) || null

        : this.getCurrentChat();


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


    if (this.state.currentChatId === chat.id) {

        this.state.messages =

            chat.messages;


        if (this.ui) {


            this.ui.updateStreamingMessage(

                messageId,

                content

            );


        }

    }


    this.saveChats();



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
   ROLLBACK EMPTY ASSISTANT MESSAGE
======================================================= */

rollbackEmptyMessage(chatId, messageId) {


    const chat = this.state.chats.find(

        item => item.id === chatId

    );


    if (!chat) {

        return;

    }


    const message = chat.messages.find(

        item => item.id === messageId

    );


    // Only roll back messages that are still empty. A response that
    // partially succeeded must never be discarded.
    if (!message || message.content) {

        return;

    }


    chat.messages = chat.messages.filter(

        item => item.id !== messageId

    );


    if (this.state.currentChatId === chatId) {

        this.state.messages = chat.messages;


        if (this.ui) {

            this.ui.removeMessage(messageId);

        }

    }


    this.saveChats();


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

createAssistantMessage(chatId = null) {


    const message = this.addMessage(

        "assistant",

        "",

        chatId

    );


    if (!message) {

        return null;

    }


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


        // Live deltas show raw text in the SAME assistant bubble.
        // Markdown/code blocks are rendered exactly once at
        // completion via updateMessage (renderMarkdown = true).
        this.ui.updateStreamingMessage(

            messageId,

            text,

            false

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

    const MAX_IMPORTED_MESSAGES = 1000;

    const MAX_MESSAGE_CONTENT_LENGTH = 50000;

    const MAX_TOTAL_CONTENT_BYTES = 5 * 1024 * 1024;

    try {


        const chat =

            typeof data === "string"

                ? JSON.parse(data)

                : data;


        if (

            !chat ||
            typeof chat !== "object" ||
            Array.isArray(chat)

        ) {

            throw new Error(

                "Invalid chat data"

            );

        }


        if (
            typeof chat.id !== "string" ||
            chat.id.trim() === ""
        ) {

            throw new Error(

                "Invalid chat data"

            );

        }


        // A duplicate ID would collide with the existing chat that
        // already uses it, shadowing the imported chat in every
        // id-based lookup (openChat/deleteChat/getCurrentChat). Only
        // regenerate the ID on collision so valid exported chats
        // round-trip unchanged.
        if (

            this.state.chats.some(

                existingChat => existingChat.id === chat.id

            )

        ) {

            chat.id = generateId("chat");

        }


        // Normalize shape so sidebar/search/storage never crash on an
        // imported chat that is missing expected fields.
        if (typeof chat.title !== "string") {

            chat.title = "";

        }


        if (!Array.isArray(chat.messages)) {

            chat.messages = [];

        } else {

            chat.messages = chat.messages

                .filter(message => message && typeof message === "object")


                .slice(-MAX_IMPORTED_MESSAGES);


            let totalContentBytes = 0;

            for (const message of chat.messages) {

                if (typeof message.content !== "string") {

                    message.content = "";

                }

                totalContentBytes += message.content.length * 2;

                if (totalContentBytes > MAX_TOTAL_CONTENT_BYTES) {

                    throw new Error("Imported chat content exceeds maximum size");

                }

                if (message.content.length > MAX_MESSAGE_CONTENT_LENGTH) {

                    message.content = message.content.slice(
                        0,
                        MAX_MESSAGE_CONTENT_LENGTH
                    );

                }

            }

        }


        if (
            typeof chat.updatedAt !== "string" ||
            Number.isNaN(
                new Date(
                    chat.updatedAt
                ).getTime()
            )
        ) {

            chat.updatedAt = new Date().toISOString();

        }


        if (
            typeof chat.createdAt !== "string" ||
            Number.isNaN(
                new Date(
                    chat.createdAt
                ).getTime()
            )
        ) {

            chat.createdAt = new Date().toISOString();

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