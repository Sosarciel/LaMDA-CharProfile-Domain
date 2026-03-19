

/**角色配置 */
export type CharOption = {
    /**角色数据路径 */
    dataPath:string;
    /**角色id */
    charId:string;
}

/**渲染的角色消息对象 */
export type CharRenderedMessage={
    /**必定为 chat */
    type:'chat';
    /**角色名称 */
    sender_name:string;
    /**消息内容 */
    content:string;
}

/**渲染完成的场景 */
export type CharScene={
    /**场景定义 */
    define:string;
    /**场景预对话 会遗忘的对话列表 */
    dialog:CharRenderedMessage[];
    /**场景记忆对话 不会遗忘的对话列表 */
    memory:CharRenderedMessage[];
    /**场景名 */
    name:string;
};

/**角色定义hbs渲染所需的上下文 */
export type TemplateContext = {
    /**角色名 */
    char:string;
    /**定义用户 */
    define_user:string;
    /**默认用户 */
    default_user:string;
    /**记忆对话 */
    memory?:string[];
    /**预对话 */
    predialog?:string[];
};

/**CharConfig 的 json 格式 */
export type CharConfigJsonTable = {
    /**角色显示名 */
    name: string;
    /**角色ID */
    id: string;
    /**默认用户名 */
    default_user_name: string;
    /**角色对状态的固定反馈 */
    status_reply_table:{
        /**状态:反馈 "未启动":"*正在休眠*" */
        [key:string]:string
    };
    /**音频翻译术语映射表 */
    term_map:{
        /**术语:翻译 "Akaset":"アカセット" */
        [key:string]:string
    };
    /**音频翻译术语映射表  翻译后 */
    term_map_after:{
        /**术语:翻译 "アッカセット":"アカセット" */
        [key:string]:string
    };
    /**逻辑回归偏置 */
    logit_bias_map:{
        /**字段:偏置 "你好":0.5 */
        [key:string]:number
    };
    /**tts实例名 */
    tts_instance_name?:string|null;
    /**tts设置 */
    tts_option?:CharConfigTTSOption;
    /**语言模型实例名 */
    lam_instance_name:string;
}

/**角色tts设置 */
export type CharConfigTTSOption = {
    /**tts角色id */
    speaker_id:string;
};
