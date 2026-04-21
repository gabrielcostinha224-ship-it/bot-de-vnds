const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Configura o painel completo de vendas')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Comando /painel-vendas registrado!');
    } catch (e) { console.error(e); }
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        // Garantir que o cargo de Vendedor exista
        let cargoVendedor = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoVendedor && i.guild) {
            cargoVendedor = await i.guild.roles.create({
                name: 'Vendedor Sirius',
                color: '#00ff6a',
                reason: 'Gerenciamento de vendas'
            }).catch(() => null);
        }

        // 1. ABRIR CONFIGURAÇÃO DO PAINEL
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const modal = new ModalBuilder().setCustomId('m_config').setTitle('Configuração Sirius Vendas');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t').setLabel('Nome do Produto').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel('Descrição (Siglas/Itens)').setStyle(TextInputStyle.Paragraph)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Valor (R$)').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('i').setLabel('Link da Imagem/Banner').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Estoque').setStyle(TextInputStyle.Short))
            );
            return await i.showModal(modal);
        }

        // 2. ENVIAR O PAINEL PARA O CANAL
        if (i.isModalSubmit() && i.customId === 'm_config') {
            const [t, d, v, img, e] = ['t', 'd', 'v', 'i', 'e'].map(f => i.fields.getTextInputValue(f));
            const embed = new EmbedBuilder()
                .setTitle(t).setDescription(d).setImage(img).setColor("#00ff6a")
                .addFields({ name: '💰 Valor', value: `R$ ${v}`, inline: true }, { name: '📦 Estoque', value: `${e}`, inline: true });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`opcoes_${t}_${v}`).setLabel('Ver Opções').setStyle(ButtonStyle.Success)
            );
            await i.channel.send({ embeds: [embed], components: [row] });
            return i.reply({ content: "✅ Painel de vendas gerado com sucesso!", ephemeral: true });
        }

        // 3. CLICOU EM "VER OPÇÕES" -> CRIA CARRINHO
        if (i.isButton() && i.customId.startsWith('opcoes_')) {
            const [_, nome, preco] = i.customId.split('_');
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVendedor?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const emb = new EmbedBuilder()
                .setTitle("Revisão do Pedido").setDescription(`**Produto:** ${nome}\n**Preço:** R$ ${preco}\n\nEscolha uma das ações abaixo para prosseguir.`)
                .setColor("#5865F2").setThumbnail(i.message.embeds[0].image?.url);

            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pagar_${preco}`).setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Vendedores: <@&${cargoVendedor?.id}>`, embeds: [emb], components: [btns] });
            await i.reply({ content: `✅ Seu carrinho foi aberto em ${canal}`, ephemeral: true });
        }

        // 4. IR PARA O PIX + TIMER DE 10 MINUTOS
        if (i.isButton() && i.customId.startsWith('pagar_')) {
            const valor = i.customId.split('_')[1];
            const pixEmbed = new EmbedBuilder()
                .setTitle("Pagamento Sirius Vendas")
                .setDescription(`Efetue o pagamento de **R$ ${valor}** via PIX.\n\n**Chave Copia e Cola:**\n\`SUA-CHAVE-AQUI\`\n\n⌛ **Atenção:** Você tem 10 minutos para concluir.`)
                .setColor("#00ff6a").setFooter({ text: "Aguardando confirmação do vendedor..." });

            const btnVendedor = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirmar').setLabel('Confirmar Recebimento').setStyle(ButtonStyle.Primary)
            );

            await i.update({ embeds: [pixEmbed], components: [btnVendedor] });

            // Timer de 10 minutos
            setTimeout(async () => {
                const checkCanal = await i.guild.channels.fetch(i.channelId).catch(() => null);
                if (checkCanal) {
                    await checkCanal.send("⏰ **Tempo esgotado!** O pagamento não foi confirmado a tempo.");
                    setTimeout(() => checkCanal.delete().catch(() => {}), 5000);
                }
            }, 600000);
        }

        // 5. CONFIRMAÇÃO PELO VENDEDOR
        if (i.isButton() && i.customId === 'confirmar') {
            if (!i.member.roles.cache.has(cargoVendedor?.id)) {
                return i.reply({ content: "❌ Apenas quem possui o cargo **Vendedor Sirius** pode confirmar!", ephemeral: true });
            }
            await i.reply("💎 **Pagamento confirmado pelo vendedor!** Iniciando entrega...");
        }

        if (i.isButton() && i.customId === 'cancelar') {
            await i.channel.delete().catch(() => {});
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } 
    catch (e) { res.send({ msg: "ERRO" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Painel Sirius rodando na porta ${PORT}`));
