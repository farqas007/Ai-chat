/* ===========================================================
   AI CHAT
   File : voiceUI.js
   Description : Voice Settings UI
=========================================================== */

import Events from "./events.js";
import { resolveRecognitionLanguage } from "./voiceSettings.js";

export class VoiceUI {

    constructor(settings){

        this.settings = settings;

        this.modal = null;

        console.log(
            "Voice UI Created"
        );

    }

    /* =======================================================
       INITIALIZE
    ======================================================= */

    initialize(){

        this.create();

        this.bindEvents();

    }

    /* =======================================================
       CREATE UI
    ======================================================= */

    create(){

        this.modal = document.createElement("div");

        this.modal.className = "voice-settings";

        this.modal.setAttribute("role", "dialog");

        this.modal.setAttribute("aria-modal", "true");

        this.modal.setAttribute("aria-labelledby", "voiceSettingsTitle");

        this.modal.innerHTML = `

<div class="voice-window">

<h2 id="voiceSettingsTitle">Voice Settings</h2>

<label>

Provider

<select id="voice-provider">

<option value="browser">Browser</option>

<option value="google">Google</option>

<option value="azure">Azure</option>

<option value="elevenlabs">ElevenLabs</option>

<option value="openai">OpenAI</option>

</select>

</label>


<label>

Language

<select id="voice-language">

<option value="auto">Auto</option>

<option value="english">English</option>

<option value="urdu">Urdu</option>

<option value="roman">Roman Urdu</option>

</select>

</label>


<label>

Rate

<input
type="range"
id="voice-rate"
min="0.5"
max="2"
step="0.1"
>

</label>


<label>

Pitch

<input
type="range"
id="voice-pitch"
min="0"
max="2"
step="0.1"
>

</label>


<label>

Volume

<input
type="range"
id="voice-volume"
min="0"
max="1"
step="0.1"
>

</label>


<label>

<input
type="checkbox"
id="voice-stream"
>

Streaming Speech

</label>


<label>

<input
type="checkbox"
id="voice-fallback"
>

Roman Urdu Fallback

</label>


<div class="voice-buttons">

<button id="voice-save">

Save

</button>

<button id="voice-close">

Close

</button>

</div>

</div>

`;

        document.body.appendChild(

            this.modal

        );

        this.modal.style.display = "none";

    }

    /* =======================================================
       EVENTS
    ======================================================= */

    bindEvents(){

        this.modal.querySelector(

            "#voice-save"

        ).onclick = ()=>{

            this.save();

        };

        this.modal.querySelector(

            "#voice-close"

        ).onclick = ()=>{

            this.hide();

        };

    }

    /* =======================================================
       SHOW
    ======================================================= */

    show(){

        this.load();

        this.modal.style.display = "flex";

        // Move focus into the dialog (PH-05).
        if (typeof this.modal.querySelector === "function") {

            const firstControl =

                this.modal.querySelector("#voice-provider");

            if (
                firstControl &&
                typeof firstControl.focus === "function"
            ) {

                firstControl.focus();

            }

        }

    }

    /* =======================================================
       HIDE
    ======================================================= */

    hide(){

        this.modal.style.display = "none";

    }

    /* =======================================================
       LOAD
    ======================================================= */

    load(){

        this.modal.querySelector(

            "#voice-provider"

        ).value =

        this.settings.get(

            "provider"

        );

        this.modal.querySelector(

            "#voice-language"

        ).value =

        this.settings.get(

            "language"

        );

        this.modal.querySelector(

            "#voice-rate"

        ).value =

        this.settings.get(

            "rate"

        );

        this.modal.querySelector(

            "#voice-pitch"

        ).value =

        this.settings.get(

            "pitch"

        );

        this.modal.querySelector(

            "#voice-volume"

        ).value =

        this.settings.get(

            "volume"

        );

        this.modal.querySelector(

            "#voice-stream"

        ).checked =

        this.settings.get(

            "streaming"

        );

        this.modal.querySelector(

            "#voice-fallback"

        ).checked =

        this.settings.get(

            "romanFallback"

        );

    }

    /* =======================================================
       SAVE
    ======================================================= */

    save(){

        const language =

            this.modal.querySelector(

                "#voice-language"

            ).value;

        this.settings.update({

            provider:

            this.modal.querySelector(

                "#voice-provider"

            ).value,

            language,

            recognitionLanguage:

            resolveRecognitionLanguage(

                language,

                "ur-PK"

            ),

            rate:Number(

                this.modal.querySelector(

                    "#voice-rate"

                ).value

            ),

            pitch:Number(

                this.modal.querySelector(

                    "#voice-pitch"

                ).value

            ),

            volume:Number(

                this.modal.querySelector(

                    "#voice-volume"

                ).value

            ),

            streaming:

            this.modal.querySelector(

                "#voice-stream"

            ).checked,

            romanFallback:

            this.modal.querySelector(

                "#voice-fallback"

            ).checked

        });

        this.settings.save();

        Events.emit(

            "voice:settings:changed",

            this.settings.all()

        );

        this.hide();

    }

}