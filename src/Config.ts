import type { ComposeOpt } from '@zwa73/modular-mixer';
import type { JObject } from '@zwa73/utils';
import { Hbs, SLogger, UtilFunc } from '@zwa73/utils';

import { CharConstant } from './Constant';
import type { CharConfigJsonTable, CharRenderedMessage, CharScene, TemplateContext } from './Interface';



const fieldList = [
    'getCharDisplayName',
    'getCharId',
    'hasVoice',
    'getDefaultUserName',
    'getDefineUserName',
    'getScene',
    'getStatusReply',
    'getDefine',
    'transReplace',
    'transAfterReplace',
    'getTTSOption',
    'getTTSInstanceName',
    'getLaMInstanceName',
    'getLogitBias',
    'getCharConfig',
] as const satisfies (keyof _CharConfig)[];
/**混入设置 */
export const CharConfigMixinOpt = {
    key:"__charConfig",
    fieldList,
} as const satisfies ComposeOpt<CharConfig>;
/**角色设置
 * @class
 */
class _CharConfig {
    /**构造函数
     * @constructor
     * @param charId         - 此对象的id
     * @param rawObj         - 用于初始化的原始对象
     * @param defineText     - 定义文本
     * @param sceneTextTable - 场景文本表
     */
    private constructor(charId:string,rawObj:JObject={}){
        this.fromJSON(rawObj);
        if(this.getCharId()!=charId)
            SLogger.warn(`CharConfig 中 charId 与配置文件中的文件不同，建议修复 charId:${charId}`);
    }

    /**构造函数
     * @param charId         - 此对象的id
     * @param rawObj         - 用于初始化的原始对象
     * @param defineText     - 定义文本
     * @param sceneTextTable - 场景文本表
     */
    static async create(charId:string,rawObj:JObject={},defineText:string,sceneTextTable:Record<string,string>={}){
        const obj = new CharConfig(charId,rawObj);
        await obj.loadScenes(sceneTextTable);
        obj.defineScene = await obj.parseDefine('define',defineText);
        return obj;
    }

    /**场景列表 */
    private sceneTable:Record<string,CharScene>={};
    /**定义场景 */
    private defineScene:CharScene=null as any;
    private charConfigObj = {} as any as CharConfigJsonTable;

    /**从JObject载入
     * @param rawObj - 初始化所用的原始对象
     */
    private fromJSON(rawObj:JObject={}):void{
        if(rawObj==null)
            SLogger.warn(`CharConfig fromJSON 错误 rawObj 为 null`);

        rawObj = rawObj ?? {};
        Object.assign(this.charConfigObj,rawObj);

        UtilFunc.initObject(this.charConfigObj,{
            name: ()=>{
                SLogger.warn(`角色缺少显示名, 已设置为Assistant rawObj:${rawObj}`);
                return "Assistant";
            },
            id: ()=>{
                SLogger.warn(`角色缺少ID, 已设置为Assistant rawObj:${rawObj}`);
                return "Assistant";
            },
            default_user_name: "Someone",
            status_reply_table: {},
            term_map: {},
            term_map_after: {},
            logit_bias_map: {},
            lam_instance_name: "default",
        });
    }

    /**解析定义文本 并替换flag
     * @param defineText - 定义文本
     * @returns 场景 null为失败
     */
    private async parseDefine(name:string,defineText:string):Promise<CharScene>{
        defineText = defineText.replace(/\r\n/g, "\n");
        const context:TemplateContext = {
            char: this.getCharDisplayName(),
            default_user: this.getDefaultUserName(),
            define_user: CharConstant.DEFINE_USER_STR,
        };
        const hbs = await Hbs.create(context);
        const define = hbs.render(defineText);
        return {
            name,
            define,
            dialog:this.parseDialog(hbs.context.predialog??[]),
            memory:this.parseDialog(hbs.context.memory??[]),
        };
    }
    /**解析对话
     * @param dialogText - 对话文本数组
     * @returns 对话记录
     */
    private parseDialog(dialogText:string[]):CharRenderedMessage[]{
        const dialogArr:CharRenderedMessage[] = [];
        for(const line of dialogText){
            const roleIndex = line.indexOf(":");
            if(roleIndex<=-1) continue;
            const char = line.slice(0,roleIndex);
            const content = line.slice(roleIndex+1,line.length);
            if(char==""||content=="") continue;
            dialogArr.push({
                type:'chat',
                sender_name:char,
                content,
            });
        }
        return dialogArr;
    }

    /**载入场景
     * @param sceneTextTable - 场景表
     */
    private async loadScenes(sceneTextTable:Record<string,string>):Promise<void>{
        if(sceneTextTable["default"]==null){
            SLogger.warn(`CharConfig.loadScene 缺少默认场景 charId:${this.getCharId()}`);
            this.sceneTable["default"]={
                name:"default",
                define:"",
                dialog:[{
                    type:'chat',
                    sender_name:this.getCharDisplayName(),
                    content:"greeting",
                }],
                memory:[],
            };
        }
        for(const sceneName in sceneTextTable){
            const scene = await this.parseDefine(sceneName,sceneTextTable[sceneName]);
            if(scene!=null){
                if(scene.dialog && scene.dialog.length <=0){
                    SLogger.warn(`CahrConfig.loadScenes 错误 dialog长度小于等于0  已跳过 sceneName:${sceneName} scene:`,scene);
                    continue;
                }
                if(scene.dialog && scene.dialog[scene.dialog.length-1].sender_name!=this.getCharDisplayName()){
                    SLogger.warn(`CahrConfig.loadScenes 错误 dialog不以角色回复结尾 已跳过 sceneName:${sceneName} scene:`,scene);
                    continue;
                }
                this.sceneTable[sceneName] = scene;
            }
        }
    }

    /** 获取角色的唯一识别id */
    getCharId(){
        return this.charConfigObj.id;
    }

    /**获取配置文件中的角色展示名 */
    getCharDisplayName(){
        return this.charConfigObj.name;
    }

    /**获取默认用户名 */
    getDefaultUserName(){
        return this.charConfigObj.default_user_name;
    }

    /**获取定义用户名 */
    getDefineUserName(){
        return CharConstant.DEFINE_USER_STR;
    }

    /**获取状态反馈
     * @param status - 目标状态
     * @returns 状态反馈
     */
    getStatusReply(status:string):string|undefined{
        const table = this.charConfigObj.status_reply_table;
        return table[status];
    }

    /**进行翻译前替换
     * @param text - 需要替换的文本
     * @returns 替换完成的文本
     */
    transReplace(text:string):string{
        const transMap = this.charConfigObj.term_map;
        for(const key in transMap){
            const regex = new RegExp(key, "gm");
            text = text.replaceAll(regex,transMap[key]);
        }
        return text;
    }

    /**进行翻译后替换
     * @param text - 需要替换的文本
     * @returns 替换完成的文本
     */
    transAfterReplace(text:string):string{
        const transMap = this.charConfigObj.term_map_after;
        for(const key in transMap){
            const regex = new RegExp(key, "gm");
            text = text.replaceAll(regex,transMap[key]);
        }
        return text;
    }

    /**获取场景 default场景必定不为空  
     * null时为default  
     * @param sceneName - 场景名 忽略则为default
     */
    getScene(sceneName:string|null = "default"):CharScene{
        if(sceneName=="null"||sceneName==null)
            sceneName="default";

        const scene = this.sceneTable[sceneName];
        if(scene==null) return this.sceneTable["default"];
        return {
            ...scene,
            name:sceneName
        };
    }

    /**是否含有场景
     * @param sceneName - 目标场景
     */
    hasScene(sceneName:string):boolean{
        return this.sceneTable[sceneName]!=null;
    }

    /** 获取定义 */
    getDefine():CharScene{
        return this.defineScene;
    }

    /**获得角色的logit bias映射 字符串-权重 映射表
     * @returns 字符串-权重 映射表
     */
    getCharLogitBiasMap():Record<string,number>{
        return this.charConfigObj.logit_bias_map;
    }

    /**获取 logit_bias 参数
     * @async
     * @returns logit_bias 参数
     */
    getLogitBias():Record<string,number>[]{
        return [CharConstant.DEFAULT_LOGIT_BIAS,this.getCharLogitBiasMap()];
    }

    /**获取角色所需要的 默认的 语言模型实例名 */
    getLaMInstanceName():string{
        return this.charConfigObj.lam_instance_name;
    }
    /**获取角色所需要的TTS实例名 */
    getTTSInstanceName():string|null{
        return this.charConfigObj.tts_instance_name ?? null;
    }
    /**获取角色所需要的TTS配置 */
    getTTSOption():JObject|null{
        return this.charConfigObj.tts_option ?? null;
    }
    /**判断该角色是否可以TTS */
    hasVoice():boolean{
        const hastts = this.getTTSInstanceName()!=null && this.getTTSOption()!=null;
        return hastts;
    }

    /**获取char设定 */
    getCharConfig(): CharConfig {
        return this;
    }
}
export const CharConfig = _CharConfig;
export type CharConfig = Pick<_CharConfig,typeof fieldList[number]>;
