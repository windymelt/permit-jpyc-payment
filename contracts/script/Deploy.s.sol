// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { PermitPayment } from "../src/PermitPayment.sol";

/// @notice PermitPayment コントラクトをデプロイするスクリプト。
/// @dev 使い方:
///   forge script script/Deploy.s.sol --rpc-url polygon --broadcast --verify -vvvv
contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PermitPayment permitPayment = new PermitPayment();
        console.log("PermitPayment deployed at:", address(permitPayment));

        vm.stopBroadcast();
    }
}
