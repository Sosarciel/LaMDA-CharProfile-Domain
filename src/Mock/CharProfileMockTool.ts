import path from "pathe";

/**CharProfile Mock 工具命名空间 */
export namespace CharProfileMockTool {
    /**Mock角色ID列表 */
    export const MOCK_CHAR_IDS = ["MockChar1", "MockChar2"] as const;
    export type MockCharId = typeof MOCK_CHAR_IDS[number];

    /**获取Mock角色数据源目录（CharProfile-Domain包内的data/mock） */
    export const getMockDataSourcePath = () => {
        return path.resolve(__dirname, "../../data/mock");
    };

    /**获取Mock角色目录 */
    export const getMockCharPath = (charId: MockCharId) => {
        return path.join(getMockDataSourcePath(), "character", charId);
    };

    /**获取Mock角色配置文件路径 */
    export const getMockCharConfigPath = (charId: MockCharId) => {
        return path.join(getMockCharPath(charId), "config.json");
    };

    /**获取Mock角色定义文件路径 */
    export const getMockCharDefinePath = (charId: MockCharId) => {
        return path.join(getMockCharPath(charId), "define.hbs");
    };

    /**获取Mock角色场景目录 */
    export const getMockCharScenesPath = (charId: MockCharId) => {
        return path.join(getMockCharPath(charId), "scenes");
    };
}
