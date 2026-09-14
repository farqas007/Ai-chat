/* ===========================================================
   AI CHAT
   File : urduToRoman.js
   Description : Urdu Script To Roman Urdu Converter
=========================================================== */


export class UrduToRoman {


    constructor(){

        this.map = {

            "مجھے":"mujhe",
            "آپ":"aap",
            "تم":"tum",
            "ہے":"hai",
            "ہیں":"hain",
            "ہوں":"hoon",
            "اردو":"urdu",
            "شاعری":"shayari",
            "شعر":"sher",
            "اشعار":"ashaar",
            "محبت":"mohabbat",
            "دل":"dil",
            "زندگی":"zindagi",
            "خوشی":"khushi",
            "غم":"gham",
            "دنیا":"duniya",
            "خدا":"khuda",
            "اللہ":"Allah",
            "کیا":"kya",
            "کیسے":"kaise",
            "کہاں":"kahan",
            "کیوں":"kyun",
            "نہیں":"nahi",
            "ہاں":"haan",
            "مزید":"mazeed",
            "چاہیے":"chahiye",
            "بتائیں":"batain",
            "پیش":"pesh",
            "جاتی":"jati",
            "جا":"ja",
            "رہا":"raha",
            "رہی":"rahi",
            "کریں":"karein",
            "کرنا":"karna"

        };


        console.log(
            "Urdu To Roman Converter Created"
        );

    }



    containsUrdu(text){

        return /[\u0600-\u06FF]/.test(text);

    }



    convert(text){


        if(!this.containsUrdu(text)){

            return text;

        }


        let words = text.split(" ");


        let result = words.map(word=>{


            return this.map[word] || word;


        });


        return result.join(" ");

    }


}