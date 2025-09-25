// ===== spreadsheet-manager.js v1.0.7 =====
// Googleスプレッドシートからチーム・グループ・メンバー情報の読み取り管理
// 修正版: 鍵保有者マッチング安定化、詳細ログ追加

// スプレッドシートのシート名定数
const SHEET_NAMES = {
  MEMBER_LIST: "各メンバーリスト",
  FIFTH_FLOOR: "5階執務室",
};

// セル範囲定数
const CELL_RANGES = {
  // チーム情報のセル範囲
  TEAMS: {
    ARAI: "B1:G1", // 新井チーム
    YOSHIKAWA: "I1:L1", // 吉川チーム
    SAKURAI: "N1:W1", // 櫻井チーム
  },
  // グループ情報のセル範囲
  GROUPS: {
    ARAI: {
      G: "B2:C2", // Gグループ
      H: "D2:E2", // Hグループ
      I: "F2:G2", // Iグループ
    },
    YOSHIKAWA: {
      A: "I2:J2", // Aグループ
      B: "K2:L2", // Bグループ
    },
    SAKURAI: {
      "C-1": "N2:O2", // C-1
      "C-2": "P2:Q2", // C-2
      "D-1": "R2:S2", // D-1
      "D-2": "T2:U2", // D-2
      ドリテク: "V2:W2", // ドリテク
      "Clothes Up!": "V6:W6", // Clothes Up! (特別項目)
    },
  },
  // 鍵保有者情報
  KEY_HOLDERS: "C24:C31", // 3階鍵保有者
};

// チーム・グループ構造定義（実際のスプレッドシート構造に基づく）
const TEAM_STRUCTURE = {
  新井チーム: {
    groups: {
      Gグループ: {
        numberColumn: "B", // 通し番号列
        nameColumn: "C", // 名前列
        startRow: 3,
        endRow: 19,
      },
      Hグループ: {
        numberColumn: "D",
        nameColumn: "E",
        startRow: 3,
        endRow: 19,
      },
      Iグループ: {
        numberColumn: "F",
        nameColumn: "G",
        startRow: 3,
        endRow: 19,
      },
    },
  },
  吉川チーム: {
    groups: {
      Aグループ: {
        numberColumn: "I",
        nameColumn: "J",
        startRow: 3,
        endRow: 25,
      },
      Bグループ: {
        numberColumn: "K",
        nameColumn: "L",
        startRow: 3,
        endRow: 25,
      },
    },
  },
  櫻井チーム: {
    groups: {
      "C-1": {
        numberColumn: "N",
        nameColumn: "O",
        startRow: 3,
        endRow: 20,
      },
      "C-2": {
        numberColumn: "P",
        nameColumn: "Q",
        startRow: 3,
        endRow: 20,
      },
      "D-1": {
        numberColumn: "R",
        nameColumn: "S",
        startRow: 3,
        endRow: 20,
      },
      "D-2": {
        numberColumn: "T",
        nameColumn: "U",
        startRow: 3,
        endRow: 20,
      },
      ドリテク: {
        numberColumn: "V",
        nameColumn: "W",
        startRow: 3,
        endRow: 5,
      },
      "Clothes Up!": {
        numberColumn: "V",
        nameColumn: "W",
        startRow: 7,
        endRow: 20,
      },
    },
  },
};

class SpreadsheetManager {
  constructor(spreadsheetUrl) {
    this.spreadsheetUrl = spreadsheetUrl;
    this.sheetId = this.extractSheetId(spreadsheetUrl);
  }

  // スプレッドシートURLからシートIDを抽出
  extractSheetId(url) {
    const match = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // 指定されたシート・範囲のCSVデータを取得
  async fetchCsvData(sheetName, range) {
    if (!this.sheetId) {
      throw new Error("無効なスプレッドシートURLです");
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${
      this.sheetId
    }/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
      sheetName
    )}&range=${encodeURIComponent(range)}`;

    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      return this.parseCsvData(text);
    } catch (error) {
      console.error(`CSVデータ取得エラー (${sheetName}!${range}):`, error);
      throw error;
    }
  }

  // CSVテキストをパースして配列に変換
  parseCsvData(csvText) {
    if (!csvText || !csvText.trim()) {
      return [];
    }

    const lines = csvText.trim().split("\n");
    return lines.map((line) => {
      // 簡易CSVパース（引用符の処理を含む）
      const cells = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            // エスケープされた引用符
            current += '"';
            i++; // 次の文字をスキップ
          } else {
            // 引用符の開始/終了
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          // セル区切り
          cells.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }

      // 最後のセルを追加
      cells.push(current.trim());

      return cells;
    });
  }

  // チーム情報を読み取り
  async fetchTeams() {
    const teams = {};

    try {
      for (const [teamName, teamInfo] of Object.entries(TEAM_STRUCTURE)) {
        teams[teamName] = {
          name: teamName,
          groups: {},
        };

        // 各グループの情報を取得
        for (const [groupName, groupInfo] of Object.entries(teamInfo.groups)) {
          const members = await this.fetchGroupMembers(
            teamName,
            groupName,
            groupInfo
          );
          teams[teamName].groups[groupName] = {
            name: groupName,
            members: members,
          };
        }
      }

      return teams;
    } catch (error) {
      console.error("チーム情報の取得エラー:", error);
      throw error;
    }
  }

  // グループのメンバー情報を取得
  async fetchGroupMembers(teamName, groupName, groupInfo) {
    const members = [];

    try {
      // 通し番号列と名前列を別々に取得
      const numberColumn = groupInfo.numberColumn;
      const nameColumn = groupInfo.nameColumn;

      // 通し番号列の範囲を取得
      const numberRange = `${numberColumn}${groupInfo.startRow}:${numberColumn}${groupInfo.endRow}`;
      const numberData = await this.fetchCsvData(
        SHEET_NAMES.MEMBER_LIST,
        numberRange
      );

      // 名前列の範囲を取得
      const nameRange = `${nameColumn}${groupInfo.startRow}:${nameColumn}${groupInfo.endRow}`;
      const nameData = await this.fetchCsvData(
        SHEET_NAMES.MEMBER_LIST,
        nameRange
      );

      // データを処理してメンバーリストを作成
      const maxRows = Math.max(numberData.length, nameData.length);
      for (let i = 0; i < maxRows; i++) {
        const numberRow = numberData[i];
        const nameRow = nameData[i];

        const number = numberRow?.[0]?.trim();
        const name = nameRow?.[0]?.trim();

        // 通し番号があり、名前も存在する場合のみ追加
        if (number && name) {
          members.push({
            number: number,
            name: name,
            team: teamName,
            group: groupName,
            isKeyHolder: false, // 後でマージされる
          });
        }
      }

      console.log(`${teamName} ${groupName}: ${members.length} members found`);
      return members;
    } catch (error) {
      console.error(
        `グループメンバー取得エラー (${teamName} ${groupName}):`,
        error
      );
      return [];
    }
  }

  // 鍵保有者情報を取得
  async fetchKeyHolders() {
    try {
      const data = await this.fetchCsvData(
        SHEET_NAMES.MEMBER_LIST,
        CELL_RANGES.KEY_HOLDERS
      );
      const keyHolders = [];

      for (const row of data) {
        if (row.length > 0) {
          const name = row[0]?.trim();
          if (name) {
            keyHolders.push(name);
          }
        }
      }

      return keyHolders;
    } catch (error) {
      console.error("鍵保有者情報の取得エラー:", error);
      return [];
    }
  }

  // 名前の比較（スペース有無を考慮した安全な比較）
  isNameMatch(memberName, keyHolderName) {
    if (!memberName || !keyHolderName) return false;

    // 1. 完全一致の場合
    if (memberName === keyHolderName) {
      console.log(`Exact match found: "${memberName}" === "${keyHolderName}"`);
      return true;
    }

    // 2. 半角スペースを除去して比較（最も一般的なケース）
    const memberNoSpace = memberName.replace(/\s+/g, "");
    const keyHolderNoSpace = keyHolderName.replace(/\s+/g, "");

    if (memberNoSpace === keyHolderNoSpace) {
      console.log(
        `Half-width space match: "${memberName}" matches "${keyHolderName}" (no spaces: "${memberNoSpace}")`
      );
      return true;
    }

    // 3. 全角スペースも除去して比較
    const memberNoAllSpace = memberName.replace(/[\s\u3000]+/g, "");
    const keyHolderNoAllSpace = keyHolderName.replace(/[\s\u3000]+/g, "");

    if (memberNoAllSpace === keyHolderNoAllSpace) {
      console.log(
        `Full-width space match: "${memberName}" matches "${keyHolderName}" (no spaces: "${memberNoAllSpace}")`
      );
      return true;
    }

    // マッチしない場合は詳細ログなし（大量になるため）
    return false;
  }

  // 全てのメンバー情報をまとめて取得
  async fetchAllMemberData() {
    try {
      const [teams, keyHolders] = await Promise.all([
        this.fetchTeams(),
        this.fetchKeyHolders(),
      ]);

      console.log("Key holders from spreadsheet:", keyHolders);

      // 鍵保有者の情報をメンバーデータにマージ
      const allMembers = [];
      const identifiedKeyHolders = [];

      for (const team of Object.values(teams)) {
        for (const group of Object.values(team.groups)) {
          for (const member of group.members) {
            // 柔軟な名前マッチングを使用
            member.isKeyHolder = keyHolders.some((keyHolder) =>
              this.isNameMatch(member.name, keyHolder)
            );

            if (member.isKeyHolder) {
              console.log(
                `Key holder identified: ${member.name} in ${team.name} ${group.name}`
              );
              identifiedKeyHolders.push(member.name);
            }

            allMembers.push(member);
          }
        }
      }

      const keyHolderCount = allMembers.filter(
        (member) => member.isKeyHolder
      ).length;
      console.log(
        `Total key holders matched: ${keyHolderCount} out of ${keyHolders.length}`
      );
      console.log("Identified key holders:", identifiedKeyHolders);

      // マッチしなかった鍵保有者をログ出力
      const unmatchedKeyHolders = keyHolders.filter(
        (keyHolder) =>
          !identifiedKeyHolders.some((identified) =>
            this.isNameMatch(identified, keyHolder)
          )
      );
      if (unmatchedKeyHolders.length > 0) {
        console.warn(
          "Unmatched key holders from spreadsheet:",
          unmatchedKeyHolders
        );
      }

      // チーム別のメンバー数詳細をログ出力
      const teamSummary = {};
      for (const [teamName, team] of Object.entries(teams)) {
        teamSummary[teamName] = {};
        let teamTotal = 0;
        for (const [groupName, group] of Object.entries(team.groups)) {
          teamSummary[teamName][groupName] = group.members.length;
          teamTotal += group.members.length;
        }
        teamSummary[teamName]["total"] = teamTotal;
      }
      console.log("Team member count details:", teamSummary);

      return {
        teams: teams,
        keyHolders: keyHolders,
        allMembers: allMembers,
        summary: {
          teamCount: Object.keys(teams).length,
          totalMembers: allMembers.length,
          keyHolderCount: keyHolderCount,
        },
      };
    } catch (error) {
      console.error("メンバーデータ取得エラー:", error);
      throw error;
    }
  }

  // キャッシュ機能付きのメンバーデータ取得
  async fetchMemberDataWithCache(forceRefresh = false) {
    const cacheKey = "memberDataCache";
    const cacheTimeKey = "memberDataCacheTime";
    const cacheExpiry = 30 * 60 * 1000; // 30分

    try {
      if (!forceRefresh) {
        const cached = await chrome.storage.local.get([cacheKey, cacheTimeKey]);
        const cacheTime = cached[cacheTimeKey];
        const cacheData = cached[cacheKey];

        if (cacheTime && cacheData && Date.now() - cacheTime < cacheExpiry) {
          console.log("キャッシュからメンバーデータを取得");
          return cacheData;
        }
      }

      console.log("スプレッドシートからメンバーデータを取得");
      const memberData = await this.fetchAllMemberData();

      // キャッシュに保存
      await chrome.storage.local.set({
        [cacheKey]: memberData,
        [cacheTimeKey]: Date.now(),
      });

      return memberData;
    } catch (error) {
      console.error("メンバーデータ取得エラー:", error);

      // エラー時はキャッシュデータを返す（あれば）
      try {
        const cached = await chrome.storage.local.get([cacheKey]);
        if (cached[cacheKey]) {
          console.log("エラー時にキャッシュからデータを取得");
          return cached[cacheKey];
        }
      } catch (cacheError) {
        console.error("キャッシュデータの取得もエラー:", cacheError);
      }

      throw error;
    }
  }
}

// ユーティリティ関数
function createSpreadsheetManager(spreadsheetUrl) {
  return new SpreadsheetManager(spreadsheetUrl);
}

// グローバルに公開（既存のpopup.jsとの互換性のため）
// 即座に実行して確実にwindowオブジェクトに公開
(function () {
  if (typeof window !== "undefined") {
    window.SpreadsheetManager = SpreadsheetManager;
    window.createSpreadsheetManager = createSpreadsheetManager;
    console.log("SpreadsheetManager loaded and exposed globally");
  }
})();
