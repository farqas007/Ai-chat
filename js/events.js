/* ===========================================================
   AI CHAT
   File : events.js
   Description : Global Event Bus
=========================================================== */

/* ===========================================================
   EVENT BUS
=========================================================== */

class EventBus {

   constructor() {

    this.events = new Map();

    this.debug = false;

    console.log("Event Bus Initialized");

}

/* =======================================================
   DEBUG
======================================================= */

enableDebug() {

    this.debug = true;

}

disableDebug() {

    this.debug = false;

}

    /* =======================================================
       SUBSCRIBE
    ======================================================= */

    on(eventName, callback) {

        if (!this.events.has(eventName)) {

            this.events.set(

                eventName,

                []

            );

        }

        this.events

            .get(eventName)

            .push(callback);

    }

    /* =======================================================
       UNSUBSCRIBE
    ======================================================= */

    off(eventName, callback) {

        if (!this.events.has(eventName)) {

            return;

        }

        const listeners =

            this.events.get(eventName);

        this.events.set(

            eventName,

            listeners.filter(

                listener =>

                    listener !== callback

            )

        );

    }

/* =======================================================
   EMIT
======================================================= */
emit(eventName, payload = null) {

    if (!this.events.has(eventName)) {

        return;

    }

    const listeners = this.events.get(eventName);

    let result;

    listeners.forEach((listener)=>{


        try {


            const value = listener(payload);

            if (value) {

                result = value;

            }


        }


        catch(error){


            console.error(

                `[EventBus] "${eventName}" failed:`,

                error

            );


        }


    });


    if(this.debug){

        console.log(

            "[EventBus]",

            eventName,

            payload

        );

    }

    return result;

}
    /* =======================================================
   SUBSCRIBE ONCE
======================================================= */

once(eventName, callback) {

    const wrapper = (payload) => {

        this.off(eventName, wrapper);

        callback(payload);

    };

    this.on(eventName, wrapper);

}


/* =======================================================
   HAS EVENT
======================================================= */

has(eventName) {

    return this.events.has(eventName);

}


/* =======================================================
   LISTENER COUNT
======================================================= */

listenerCount(eventName) {

    if (!this.events.has(eventName)) {

        return 0;

    }

    return this.events.get(eventName).length;

}


/* =======================================================
   CLEAR
======================================================= */

clear(eventName = null) {

    if (eventName === null) {

        this.events.clear();

        return;

    }

    this.events.delete(eventName);

}

}

/* ===========================================================
   SINGLETON
=========================================================== */

const Events = new EventBus();

/* ===========================================================
   EXPORT
=========================================================== */

export default Events;