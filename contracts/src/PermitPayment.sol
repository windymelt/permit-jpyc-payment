// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title PermitPayment
/// @notice ERC-2612 permit と transferFrom を 1 トランザクションで atomic
/// に実行するラッパー。
///         msg.sender == receiver を要求することで、QR_B 傍受による receiver
/// 差し替え攻撃を防ぐ。
contract PermitPayment {
    using SafeERC20 for IERC20;

    /// @notice permit を実行して token を owner から receiver へ転送する。
    /// @dev 呼び出し元 (msg.sender) が receiver と一致しなければ revert する。
    /// @param token    ERC-20 (ERC-2612 対応) コントラクトアドレス
    /// @param owner    トークン保有者（送り手）のアドレス
    /// @param receiver 受取人のアドレス。msg.sender と一致すること
    /// @param value    転送量（最小単位）
    /// @param deadline permit の有効期限 (Unix timestamp)
    /// @param v        EIP-712 署名の v
    /// @param r        EIP-712 署名の r
    /// @param s        EIP-712 署名の s
    function permitAndTransfer(
        address token,
        address owner,
        address receiver,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(msg.sender == receiver, "PermitPayment: only receiver");
        IERC20Permit(token).permit(owner, address(this), value, deadline, v, r, s);
        IERC20(token).safeTransferFrom(owner, receiver, value);
    }
}
