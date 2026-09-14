export class FileRanker {


rank(task="", files=[]){

    if(!Array.isArray(files)){
        return [];
    }


    const keywords = this.extractKeywords(task);


    return files

    .map(file=>({

        ...file,

        score:this.calculateScore(
            file,
            keywords
        )

    }))

    .filter(file=>file.score > 0)

    .sort(
        (a,b)=>b.score-a.score
    );

}



extractKeywords(task){

    return task

    .toLowerCase()

    .replace(
        /[^a-z0-9\s]/g,
        ""
    )

    .split(/\s+/)

    .filter(
        word=>word.length>2
    );

}



calculateScore(file,keywords=[]){

    let score=0;


    const path=
    (file.path || file.name || "")
    .toLowerCase();


    const content=
    (file.content || "")
    .toLowerCase();



    for(const word of keywords){


        if(path.includes(word))
            score +=20;



        if(content.includes(word))
            score +=10;


    }



    const rules=[


        ["chat",[
            "chat",
            "message",
            "conversation"
        ],10],


        ["voice",[
            "voice",
            "speech",
            "audio"
        ],12],


        ["ui",[
            "button",
            "panel",
            "interface"
        ],8],


        ["api",[
            "api",
            "fetch",
            "request"
        ],10],


        ["memory",[
            "memory",
            "storage"
        ],8]


    ];



    for(const rule of rules){

        const [
            name,
            words,
            points
        ]=rule;


        if(
            words.some(
                w=>keywords.includes(w)
            )
        ){

            if(
                path.includes(name)
            ){

                score += points;

            }

        }

    }



    if(path.includes("/js/"))
        score+=2;


    if(path.includes("/agent/"))
        score+=5;


    return score;

}


}