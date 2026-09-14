import {
saveConversation,
loadConversation
}
from "../memory/conversationMemory.js";


saveConversation(
"User likes Urdu AI assistant"
);


saveConversation(
"User is building AI Chat project"
);


console.log(
loadConversation()
);
