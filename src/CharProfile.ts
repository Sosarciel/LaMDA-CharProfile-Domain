import type { ComposeOpt } from "@zwa73/modular-mixer";
import { Composer } from "@zwa73/modular-mixer";
import { UtilFunc } from "@zwa73/utils";

import { CharAccesser, CharAccesserMixinOpt } from "./Accesser";
import type { CharConfig } from "./Config";
import { CharConfigMixinOpt } from "./Config";
import type { CharOption } from "./Interface";


const fieldList = [
    ...CharConfigMixinOpt.fieldList,
    ...CharAccesserMixinOpt.fieldList,
    "getCH",
] as const;
/**混入设置 */
export const CharHelperMixinOpt = {
    key:"__charHelper",
    fieldList,
} as const satisfies ComposeOpt<CharProfile>;
class _CharProfile {
    //#region 构造函数
    private constructor() {}
    /**创建角色档案实例
     * @param opt - 角色选项
     * @returns 角色档案实例
     */
    static async create(opt:CharOption): Promise<CharProfile> {
        const ch = new _CharProfile();

        //初始化
        const da = await CharAccesser.create(opt);
        const charConfig = await da.loadChar();

        //组合
        return compose(ch,charConfig,da);
    }
    //#endregion

    //———————————————————— utils ————————————————————//
    /**重载角色配置 */
    async reloadChar(): Promise<CharConfig> {
        const charConfig = await fix(this).loadChar();
        //重定向组合
        if(fix(this).__charConfig!==undefined)
            fix(this).__charConfig = charConfig;
        return charConfig;
    }

    /**保存到文件 */
    async saveToFile(): Promise<void> { }
    /**获取该实例
     * @returns 角色档案实例
     */
    getCH(): CharProfile {
        return fix(this);
    }
}

//混入
const fix = (obj:_CharProfile)=>obj as any as CharProfile;
function compose(obj:_CharProfile,charConfig:CharConfig,charAccesser:CharAccesser){
    const ob1 = Composer.compose(obj,
        {...CharConfigMixinOpt,mixin:charConfig},
        {...CharAccesserMixinOpt,mixin:charAccesser}
    );
    return ob1;
}

/**角色管理器选项 */
export type CharProfileOption = {
    /**资源目录 */
    dataPath:string
}
/**角色管理器 */
export type CharProfile = ReturnType<typeof compose>;
export const CharProfile = UtilFunc.createInjectable({
    initInject:(opt:CharProfileOption)=>{
        const {dataPath} = opt;
        /**根据charId存储的 CharHelper */
        const charTable:Record<string,CharProfile> = {};
        return {
            /**根据charId获取角色档案实例，不存在则创建 */
            getCharHelper: async (charId:string):Promise<CharProfile|undefined>=>{
                let ch = charTable[charId];
                if(ch==null){
                    if((await CharAccesser.check({dataPath,charId}))==false)
                        return undefined;
                    ch = await _CharProfile.create({dataPath,charId});
                    charTable[charId] = ch;
                }
                return ch;
            }
        };
    }
});
