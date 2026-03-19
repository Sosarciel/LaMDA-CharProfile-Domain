import type { StaticClass } from "@zwa73/js-utils";



/**角色常量 */
export class CharConstant implements StaticClass<typeof CharConstant>{
    /** 音频后缀 */
    static readonly AUDIO_EXT = ".flac";
    /** 配置后缀 */
    static readonly CONFIG_EXT = ".json";
    /** 定义后缀 */
    static readonly DEFINE_EXT = ".hbs";
    /** 抽象指向的定义用户 */
    static readonly DEFINE_USER_STR = "Individual";
    /** 默认的logit_bias字符串组
     * 降低定义用户Individual和assistant格式出现的几率
     */
    static readonly DEFAULT_LOGIT_BIAS:Record<string,number> = {
        "Individual":-10,
        "individual":-10,
        "assistant" :-10,
        "助"        :-1 ,
    };
}