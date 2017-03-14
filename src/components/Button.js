import React from "react";
import styled from "styled-components";
import colors from "yoast-components/style-guide/colors.json";

export const Button = styled.button`
	height: 48px;
	padding: 0 15px;
	border: 0;
	background-color: ${colors.$color_blue};
	color: ${colors.$color_white};
	box-shadow: 0px 2px 8px 0px rgba(0, 0, 0, 0.3);
	border-radius: 5px;
	font-size: 14px;
	font-family: "Open Sans";
	text-transform: uppercase;
	cursor: pointer;
`;

Button.propTypes = {
	onClick: React.PropTypes.func,
	type: React.PropTypes.string,
};

Button.defaultProps = {
	type: "button",
};

export const LargeButton = styled( Button )`
	min-width: 150px;
`;

export const GreenButton = styled( Button )`
	background-color: ${colors.$color_green};
`;

export const LogoutButton = styled( Button )`
	background-color: ${colors.$color_white};
	color: ${colors.$color_blue};
	border-radius: 3px;
	height: 36px;
	width: 112px;
	padding: 0;

export const WhiteButton = styled( LargeButton )`
	color: ${colors.$color_blue};
	background-color: ${colors.$color_white};
`;