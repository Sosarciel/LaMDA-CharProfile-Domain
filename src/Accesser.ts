import fs from "fs";

import type { ComposeOpt } from "@zwa73/modular-mixer";
import type { JObject, JToken } from "@zwa73/utils";
import { SLogger, UtilFT, throwError } from "@zwa73/utils";
import path from "pathe";

import { CharConfig } from "./Config";
import { CharConstant } from "./Constant";
import type { CharOption } from "./Interface";


/**混入设置 */
export const CharAccesserMixinOpt = {
    key:"__charAccesser",
    fieldList:[
        'hasAudioFile',
        'getAudioPath',
        'deleteAudioFile',
        'saveFavoriteStatus',
        'loadChar',
    ]
} as const satisfies ComposeOpt<CharAccesser>;

/**数据读写管理器
 * @class
 * @param charName - 此对象的命名
 */
export class CharAccesser {
    //#region 文件路径
    /**角色数据文件夹 */
    private dataDir: string;
    /**角色id */
    private charId: string;
    /**角色设定文件 */
    private charConfigPath: string;
    /**角色定义文件 */
    private charDefinePath: string;
    /**角色场景文件夹 */
    private charSceneDir: string;
    /**音频文件夹 */
    private audioDir: string;
    /**收藏夹文件夹 */
    private favoritesDir: string;
    //#endregion

    private constructor({dataPath,charId}:{dataPath:string,charId: string}) {
        this.charId = charId;
        this.dataDir = path.join(dataPath, "character", this.charId, path.sep);
        //./data/Akaset/
        //载入设置
        this.charConfigPath  = path.join(this.dataDir, `config${CharConstant.CONFIG_EXT}`); //角色设定
        this.charDefinePath  = path.join(this.dataDir, `define${CharConstant.DEFINE_EXT}`); //角色定义
        this.charSceneDir    = path.join(this.dataDir, "scenes"    ); //场景文件夹
        this.audioDir        = path.join(this.dataDir, "voices"    ); //音频文件 文件夹
        this.favoritesDir    = path.join(this.dataDir, `favorites` ); //收藏的角色log
    }

    /**静态异步构造函数
     * @param dataPath - 资源文件绝对路径
     * @param charId   - 角色id
     * @returns Promise实例
     */
    static async create({dataPath,charId}:CharOption): Promise<CharAccesser> {
        const ca = new CharAccesser({dataPath,charId});
        //如果不存在
        if (!(await UtilFT.pathExists(ca.charConfigPath)))
            throwError(`CharFilePath.init 错误:\n${charId}配置不存在`);
        //检查文件夹
        await ca.checkFolder();
        return ca;
    }

    /**检查某个角色目录是否存在 */
    static async check(opt:CharOption): Promise<boolean> {
        const ca = new CharAccesser(opt);
        //如果不存在
        if (!(await UtilFT.pathExists(ca.charConfigPath)))
            return false;
        return true;
    }

    //CharConfig
    /**加载char设定
     * @async
     */
    async loadChar(): Promise<CharConfig> {
        const jo = await UtilFT.loadJSONFile(this.charConfigPath) as JObject;

        const filterList = await UtilFT.fileSearchGlob(this.charSceneDir, `*${CharConstant.DEFINE_EXT}`);
        const procTable = await Promise.all(filterList.map(async (fp)=>({
            name: path.parse(fp).name,
            text: await fs.promises.readFile(fp, "utf-8")
        })));
        const sceneTable = procTable.reduce((acc,cur)=>({
            ...acc, [cur.name]: cur.text
        }),{}as Record<string,string>);

        //载入定义
        let define = "";
        try {
            define = await fs.promises.readFile(this.charDefinePath, "utf-8");
        } catch (e) {
            SLogger.error(
                `CharAccesser.loadCharConfig 错误 define.txt 不存在 path:${this.charDefinePath}`
            );
        }

        return CharConfig.create(this.charId, jo, define, sceneTable);
    }

    /** 检查文件夹是否存在 如不存在则创建 */
    async checkFolder(): Promise<void> {
        await UtilFT.ensurePathExists(this.audioDir    , {dir:true});
        await UtilFT.ensurePathExists(this.favoritesDir, {dir:true});
    }

    //#region audio
    /**根据消息ID获得音频文件位置 绝对路径
     * @param messageid - 消息ID
     */
    getAudioPath(messageid: string): string {
        const pt = path.join(this.audioDir, messageid + CharConstant.AUDIO_EXT);
        return path.resolve(pt);
    }
    /**根据消息ID判断音频文件是否存在
     * @async
     * @param messageid - 消息ID
     * @returns 是否存在
     */
    async hasAudioFile(messageid: string): Promise<boolean> {
        const audioPath = this.getAudioPath(messageid);
        if (await UtilFT.pathExists(audioPath))
            return true;
        return false;
    }
    /**根据消息ID删除音频文件
     * @async
     * @param messageid - 消息ID
     * @returns 是否成功删除
     */
    async deleteAudioFile(messageid: string): Promise<boolean> {
        if (await this.hasAudioFile(messageid)) {
            try {
                void fs.promises.unlink(this.getAudioPath(messageid));
            } catch (e) {
                SLogger.warn(`CharAccesser.deleteAudioFile 错误\n${e}`);
                return false;
            }
            return true;
        }
        return false;
    }
    //#endregion

    //#region favorites
    /**获取收藏夹目录
     * @param posflag - 位置状态flag
     */
    getFavoritesFolder(posflag:string): string {
        return path.join(this.favoritesDir, posflag);
    }

    /**保存数据到收藏文件夹
     * @async
     * @param posflag - 位置状态flag
     */
    async saveFavoriteStatus(posflag: string,log:JToken,audioList:string[]): Promise<void> {
        const favoritesDir = this.getFavoritesFolder(posflag);
        await UtilFT.ensurePathExists(favoritesDir,{dir:true});
        const audiopath = path.join(favoritesDir,'audio');
        await UtilFT.ensurePathExists(audiopath,{dir:true});
        const getSaveAudioPath = (messageid: string)=>{
            const pt = path.join(audiopath,messageid + CharConstant.AUDIO_EXT);
            return path.resolve(pt);
        };

        //保存音频
        await Promise.all(audioList.map(async aid=>{
            const audioFilePath = this.getAudioPath(aid);
            const saveAudioPath = getSaveAudioPath(aid);
            if(!await UtilFT.pathExists(audioFilePath)){
                //SLogger.info(`音频不存在\n${audioFilePath}`);
                return;
            }
            try {
                await fs.promises.copyFile(audioFilePath, saveAudioPath);
                //SLogger.warn(`音频已保存至\n${saveAudioPath}`);
            } catch (err) {
                SLogger.error(`CharFileController.saveFavoriteAudio 保存音频遭遇错误\n${err}`);
            }
        }));

        //保存记录
        await UtilFT.writeJSONFile(path.join(favoritesDir, 'log.json'),log);
        SLogger.info(`已保存log\n${posflag}`);
    }
    //#endregion

    /**获取数据读写管理器
     * @returns 数据读写管理器
     */
    getCharAccesser(): CharAccesser {
        return this;
    }
}
