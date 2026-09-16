export class ToolManager {


    execute(tool){

        console.log("Tool executing:", tool);


        return {
            success:false,
            error:"Tool execution is not implemented",
            tool
        };

    }


}
