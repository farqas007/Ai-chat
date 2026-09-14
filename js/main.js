/* ===========================================================
   AI CHAT
   File : main.js
   Description : Application Entry Point
=========================================================== */
console.log("MAIN JS STARTED");

import { App } from "./app.js";

console.log("MAIN.JS LOADED");

/* ===========================================================
   GLOBAL APP INSTANCE
=========================================================== */


let app = null;



/* ===========================================================
   START APPLICATION
=========================================================== */


async function startApp() {


    try {


        console.log(

            "Launching AI Chat..."

        );



        app = new App();



        window.aiChatApp = app;



        await app.initialize();



        console.log(

            "AI Chat Started Successfully"

        );



    }


    catch(error){


        console.error(

            "Startup Error:",

            error

        );


    }


}



/* ===========================================================
   DOM READY
=========================================================== */


if (

    document.readyState === "loading"

) {


    document.addEventListener(

        "DOMContentLoaded",

        startApp

    );


}

else {


    startApp();


}



/* ===========================================================
   CLEANUP
=========================================================== */


window.addEventListener(

    "beforeunload",

    () => {


        if(app){


            app.destroy();


        }


    }

);