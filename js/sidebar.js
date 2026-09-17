/* ===========================================================
   AI CHAT
   File : sidebar.js
   Description : Sidebar Manager
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   SIDEBAR MANAGER
=========================================================== */

export class Sidebar {


    constructor() {
        
        this.eventsRegistered = false;


        this.storage = null;


        this.elements = {


            sidebar: document.querySelector(

                "#sidebar"

            ),


            newChatButton: document.querySelector(

                "#newChatBtn"

            ),


            chatList: document.querySelector(

                "#conversationList"

            ),


            searchInput: document.querySelector(

                "#searchChats"

            )


        };



        this.state = {


            chats: [],


            activeChatId: null


        };



        console.log(

            "Sidebar Created"

        );


    }





    /* =======================================================
       CONNECT
    ======================================================= */


    connect(storage) {


        this.storage = storage;


    }





    /* =======================================================
       INITIALIZE
    ======================================================= */


    initialize() {

        this.registerChatEvents();
        
        this.bindEvents();


        this.loadChats();


        this.render();



        console.log(

            "Sidebar Initialized"

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
   BIND EVENTS
======================================================= */

bindEvents() {


    /* ----------------------------------------
       New Chat Button
    ---------------------------------------- */

    if (this.elements.newChatButton) {


        this.elements.newChatButton.addEventListener(

            "click",

            () => {


                Events.emit(

                    "chat:new"

                );


            }

        );


    }





    /* ----------------------------------------
       Chat Selection
    ---------------------------------------- */


    if (this.elements.chatList) {


        this.elements.chatList.addEventListener(

            "click",

            event => {


                const item =

                    event.target.closest(

                        ".chat-item"

                    );



                if (!item) {

                    return;

                }



                const chatId =

                    item.dataset.chatId;



                this.state.activeChatId =

                    chatId;



                Events.emit(

                    "chat:selected",

                    chatId

                );



                this.render();


            }

        );


    }





    /* ----------------------------------------
       Search
    ---------------------------------------- */


    if (this.elements.searchInput) {


        this.elements.searchInput.addEventListener(

            "input",

            event => {


                const query =

                    event.target.value;



                this.search(query);



            }

        );


    }


}

/* =======================================================
   SEARCH CHATS
======================================================= */

search(query = "") {


    if (!query.trim()) {


        this.render(

            this.state.chats

        );


        return;


    }



    const filtered =

        this.state.chats.filter(

            chat =>


                chat.title

                .toLowerCase()

                .includes(

                    query.toLowerCase()

                )

        );



    this.render(

        filtered

    );


}


/* =======================================================
   CREATE CHAT ITEM ACTIONS
======================================================= */

createActions(chat) {


    const actions = document.createElement(

        "div"

    );


    actions.className =

        "chat-actions";



    const renameButton = document.createElement(

        "button"

    );


    renameButton.className =

        "rename-chat";


    renameButton.setAttribute(
        "aria-label",
        "Rename chat"
    );

    renameButton.setAttribute(
        "title",
        "Rename chat"
    );

    renameButton.innerHTML =
        '<svg class="icon-btn" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';



    renameButton.addEventListener(

        "click",

        event => {


            event.stopPropagation();


            Events.emit(

                "chat:rename",

                chat.id

            );


        }

    );



    const deleteButton = document.createElement(

        "button"

    );


    deleteButton.className =

        "delete-chat";


    deleteButton.setAttribute(
        "aria-label",
        "Delete chat"
    );

    deleteButton.setAttribute(
        "title",
        "Delete chat"
    );

    deleteButton.innerHTML =
        '<svg class="icon-btn" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';



    deleteButton.addEventListener(

        "click",

        event => {


            event.stopPropagation();


            Events.emit(

                "chat:delete",

                chat.id

            );


        }

    );



    actions.appendChild(

        renameButton

    );


    actions.appendChild(

        deleteButton

    );


    return actions;


}



/* =======================================================
   UPDATE RENDER ITEM
======================================================= */

renderChatItem(chat) {


    const item = document.createElement(

        "div"

    );


    item.className =

        "chat-item";



    item.dataset.chatId =

        chat.id;



    const title = document.createElement(

        "span"

    );


    title.className =

        "chat-title";



    title.textContent =

        chat.title;



    item.appendChild(

        title

    );



    item.appendChild(

        this.createActions(chat)

    );



    if (

        chat.id === this.state.activeChatId

    ) {


        item.classList.add(

            "active"

        );


    }



    return item;


}

/* =======================================================
   RENDER CHAT LIST
======================================================= */
render(chats = this.state.chats) {


    if (!this.elements.chatList) {

        return;

    }


    this.elements.chatList.innerHTML = "";


    const groups = this.createGroups(chats);



    Object.keys(groups).forEach(

        groupName => {


            if(groups[groupName].length === 0){

                return;

            }



            const title = document.createElement(
                "div"
            );


            title.className =
                "chat-group-title";


            title.textContent =
                groupName;



            this.elements.chatList.appendChild(
                title
            );



            groups[groupName].forEach(

                chat => {


                    const item =
                        this.renderChatItem(chat);



                    this.elements.chatList.appendChild(
                        item
                    );


                }

            );


        }

    );


}
/* =======================================================
   LISTEN FOR CHAT UPDATES
======================================================= */

registerChatEvents() {


    Events.on(

        "chat:selected",

        chat => {


            const chatId =

                typeof chat === "string"

                    ? chat

                    : chat && chat.id;


            if (chatId) {


                this.setActiveChat(

                    chatId

                );


            }


        }

    );


    Events.on(

        "chat:created",

        chat => {


            this.state.chats.push(

                chat

            );


            this.render();


        }

    );



    Events.on(

        "chat:imported",

        chat => {


            this.state.chats.push(

                chat

            );


            this.render();


        }

    );



    Events.on(

        "chat:deleted",

        chatId => {


            this.state.chats =

                this.state.chats.filter(

                    chat =>

                    chat.id !== chatId

                );



            this.render();


        }

    );



    Events.on(

        "chat:renamed",

        chat => {


            const item =

                this.state.chats.find(

                    c => c.id === chat.id

                );



            if (item) {


                item.title = chat.title;


            }



            this.render();


        }

    );


    Events.on(

        "chat:title-updated",

        chat => {


            const item =

                this.state.chats.find(

                    c => c.id === chat.id

                );



            if (item) {


                item.title = chat.title;

                item.updatedAt = chat.updatedAt;


            }



            this.render();


        }

    );


}

/* =======================================================
   SORT CHATS BY RECENT
======================================================= */

sortChats(chats = this.state.chats) {


    return [...chats].sort(

        (a, b) => {


            return new Date(

                b.updatedAt

            ) - new Date(

                a.updatedAt

            );


        }

    );


}


/* =======================================================
   GROUP CHATS
======================================================= */

groupChats() {


    const groups = {


        today: [],


        previous: [],


        older: []


    };



    const now = new Date();



    this.state.chats.forEach(

        chat => {


            const date = new Date(

                chat.updatedAt

            );


            const difference =

                now - date;



            const days =

                difference /

                (1000 * 60 * 60 * 24);



            if (days < 1) {


                groups.today.push(

                    chat

                );


            }

            else if (days < 7) {


                groups.previous.push(

                    chat

                );


            }

            else {


                groups.older.push(

                    chat

                );


            }


        }

    );



    return groups;


}

createGroups(chats){


    const groups = {


        "Today":[],

        "Previous 7 Days":[],

        "Older":[]


    };



    const now = new Date();



    chats.forEach(chat=>{


        const date =
            new Date(chat.updatedAt);



        const days =
            (now - date) /
            (1000*60*60*24);



        if(days < 1){


            groups["Today"].push(chat);


        }

        else if(days < 7){


            groups["Previous 7 Days"].push(chat);


        }

        else{


            groups["Older"].push(chat);


        }


    });



    return groups;


}

/* =======================================================
   TOGGLE SIDEBAR
======================================================= */

toggle() {


    if (!this.elements.sidebar) {

        return;

    }



    this.elements.sidebar.classList.toggle(

        "collapsed"

    );



    Events.emit(

        "sidebar:toggled"

    );


}



/* =======================================================
   REFRESH SIDEBAR
======================================================= */

refresh() {


    this.loadChats();


    const sorted =

        this.sortChats();



    this.render(

        sorted

    );


}



/* =======================================================
   SET ACTIVE CHAT
======================================================= */

setActiveChat(chatId) {


    this.state.activeChatId = chatId;


    this.render();


}



/* =======================================================
   GET STATE
======================================================= */

getState() {


    return {


        ...this.state


    };


}



/* =======================================================
   RESET
======================================================= */

reset() {


    this.state.chats = [];


    this.state.activeChatId = null;


    this.render();


}



/* =======================================================
   DESTROY
======================================================= */

destroy() {


    this.reset();


    this.storage = null;


    this.elements = {};


    console.log(

        "Sidebar Destroyed"

    );


}

}