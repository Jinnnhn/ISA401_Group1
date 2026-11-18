import {defineConfig,loadEnv} from 'vite';
import {createChatMiddleware} from './server/chat';

export default defineConfig(({mode})=>{
 const apiKey=process.env.DEEPSEEK_API_KEY?.trim()||loadEnv(mode,process.cwd(),'DEEPSEEK_').DEEPSEEK_API_KEY?.trim();
 return {
  plugins:[{
   name:'spacemate-local-chat',
   configureServer(server){server.middlewares.use(createChatMiddleware(apiKey));},
  }],
 };
});
